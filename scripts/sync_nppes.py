#!/usr/bin/env python3
"""
PainBeacon — monthly NPPES → Supabase sync. Runs in GitHub Actions (see
.github/workflows/nppes-sync.yml). Can also be run locally:

    SUPABASE_URL=... SUPABASE_SERVICE_KEY=... python scripts/sync_nppes.py
    DRY_RUN=1 ... python scripts/sync_nppes.py   # plan only, write nothing

What it does, carefully:
  1. Downloads the latest NPPES monthly full file (~1 GB zip) and streams the
     main CSV out of the zip without extracting (disk/memory friendly).
  2. Filters to the SAME pain taxonomy codes as the original pull
     (any of the 15 taxonomy slots matching), same field mapping, same slugs.
  3. Diffs against the live `clinics` table and then:
       UPDATES  — existing NPIs whose NPPES-sourced fields changed. ONLY those
                  fields are touched. listing_tier, enhanced_*, outreach_*,
                  Google enrichment, slug (URL stability!) are NEVER written.
       INSERTS  — genuinely new pain clinics: deduped against existing
                  clusters (normalized phone+ZIP5, fallback address+ZIP+city,
                  mirroring dedupe_clinics.sql), zone assigned by majority
                  vote of existing clinics in the same state+ZIP3 (+city tie-
                  break), slug made unique, primary_npi set accordingly.
       FLAGS    — NPIs that vanished from NPPES => nppes_active=false + note
                  (never deleted); NPIs still in NPPES but no longer carrying
                  a pain taxonomy => note only. Both for your review.
  4. Prints a summary (and into the GitHub run summary), then pings the
     Cloudflare deploy hook so the site rebuilds — only if something changed.

Env vars (set as GitHub Actions secrets):
  SUPABASE_URL            e.g. https://xxxx.supabase.co
  SUPABASE_SERVICE_KEY    service-role key (server-side only — never in site code)
  CLOUDFLARE_DEPLOY_HOOK  optional; Pages deploy-hook URL to rebuild after changes
  DRY_RUN                 optional; "1" = plan and report, write nothing
"""

import csv
import io
import json
import os
import re
import sys
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone

import requests

# ---------------------------------------------------------------------------
# Config — mirrors nppes_bulk.py exactly.
# ---------------------------------------------------------------------------
PAIN_CODES = {"208VP0014X", "208VP0000X", "2084P2900X", "207LP2900X", "2081P2900X"}
CODE_DESC = {
    "208VP0014X": "Pain Medicine - Interventional Pain Medicine",
    "208VP0000X": "Pain Medicine - Pain Medicine",
    "2084P2900X": "Psychiatry & Neurology - Pain Medicine",
    "207LP2900X": "Anesthesiology - Pain Medicine",
    "2081P2900X": "Physical Medicine & Rehabilitation - Pain Medicine",
}
NPPES_FILES_PAGE = "https://download.cms.gov/nppes/NPI_Files.html"
DOWNLOAD_DIR = os.environ.get("NPPES_TMP", "/tmp/nppes")

SUPABASE_URL = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or ""
DEPLOY_HOOK = os.environ.get("CLOUDFLARE_DEPLOY_HOOK") or ""
DRY_RUN = os.environ.get("DRY_RUN", "") == "1"

# NPPES-sourced columns the sync is allowed to update on existing rows.
# Everything else (listing_tier, enhanced_*, outreach_*, enrichment, slug,
# zone unless the clinic moved) is off-limits by construction.
UPDATABLE = [
    "name", "address_1", "address_2", "city", "state", "postal_code", "country",
    "phone", "fax", "primary_taxonomy_code", "primary_taxonomy_desc",
    "all_taxonomy_codes", "provider_credentials",
    "authorized_official_name", "authorized_official_title",
    "authorized_official_phone", "parent_organization", "organizational_subpart",
    "nppes_last_updated",
]

S = requests.Session()
S.headers.update({"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"})


def log(msg):
    print(f"[sync] {msg}", flush=True)


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ---------------------------------------------------------------------------
# Parsing — identical logic to nppes_bulk.py.
# ---------------------------------------------------------------------------
def slugify(*parts):
    s = "-".join(p for p in parts if p)
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return re.sub(r"-{2,}", "-", s)


def pain_codes_in_row(row):
    found = []
    for i in range(1, 16):
        c = (row.get(f"Healthcare Provider Taxonomy Code_{i}", "") or "").strip()
        if c in PAIN_CODES:
            primary = (row.get(f"Healthcare Provider Primary Taxonomy Switch_{i}", "") or "").strip() == "Y"
            found.append((c, primary))
    return found


def parse_row(row):
    """Return a clinics-shaped dict for a pain row, else None."""
    codes = pain_codes_in_row(row)
    if not codes:
        return None
    is_org = (row.get("Entity Type Code", "") or "").strip() == "2"
    if is_org:
        name = (row.get("Provider Organization Name (Legal Business Name)", "") or "").strip()
        credentials = ""
        ao = " ".join(x for x in [row.get("Authorized Official First Name", ""),
                                  row.get("Authorized Official Last Name", "")] if x).strip()
        ao_title = (row.get("Authorized Official Title or Position", "") or "").strip()
        ao_phone = (row.get("Authorized Official Telephone Number", "") or "").strip()
    else:
        name = " ".join(x for x in [row.get("Provider First Name", ""),
                                    row.get("Provider Middle Name", ""),
                                    row.get("Provider Last Name (Legal Name)", "")] if x).strip()
        credentials = (row.get("Provider Credential Text", "") or "").strip()
        ao = ao_title = ao_phone = ""

    city = (row.get("Provider Business Practice Location Address City Name", "") or "").strip()
    state = (row.get("Provider Business Practice Location Address State Name", "") or "").strip()
    primary_code = next((c for c, p in codes if p), codes[0][0])
    all_codes = []
    for i in range(1, 16):
        c = (row.get(f"Healthcare Provider Taxonomy Code_{i}", "") or "").strip()
        if c and c not in all_codes:
            all_codes.append(c)
    return {
        "npi": (row.get("NPI", "") or "").strip(),
        "enumeration_type": "NPI-2" if is_org else "NPI-1",
        "name": name,
        "city": city,
        "state": state,
        "address_1": (row.get("Provider First Line Business Practice Location Address", "") or "").strip(),
        "address_2": (row.get("Provider Second Line Business Practice Location Address", "") or "").strip(),
        "postal_code": ((row.get("Provider Business Practice Location Address Postal Code", "") or "").strip())[:10],
        "country": (row.get("Provider Business Practice Location Address Country Code (If outside U.S.)", "") or "US").strip() or "US",
        "phone": (row.get("Provider Business Practice Location Address Telephone Number", "") or "").strip(),
        "fax": (row.get("Provider Business Practice Location Address Fax Number", "") or "").strip(),
        "primary_taxonomy_code": primary_code,
        "primary_taxonomy_desc": CODE_DESC.get(primary_code, ""),
        "all_taxonomy_codes": "|".join(all_codes),
        "provider_credentials": credentials,
        "authorized_official_name": ao,
        "authorized_official_title": ao_title,
        "authorized_official_phone": ao_phone,
        "parent_organization": (row.get("Parent Organization LBN", "") or "").strip(),
        "organizational_subpart": (row.get("Is Organization Subpart", "") or "").strip(),
        "nppes_last_updated": (row.get("Last Update Date", "") or "").strip(),
    }


# ---------------------------------------------------------------------------
# Normalizers for dedup + zones (mirror dedupe_clinics.sql intent).
# ---------------------------------------------------------------------------
def norm_phone(p):
    d = re.sub(r"\D", "", p or "")
    return d[-10:] if len(d) >= 10 else ""


def zip5(z):
    d = re.sub(r"\D", "", z or "")
    return d[:5] if len(d) >= 5 else ""


def norm_addr(a):
    return re.sub(r"[^a-z0-9]", "", (a or "").lower())


# ---------------------------------------------------------------------------
# NPPES download.
# ---------------------------------------------------------------------------
SYNC_VERSION = 5  # bump on every change; logged at start so runs are unambiguous


# ---------------------------------------------------------------------------
# v4: normalized field comparison. The DB stores display-friendly values
# (title-cased names, formatted phones); the NPPES file is raw ALL-CAPS and
# bare digits. Only a *normalized* difference counts as a real change — and
# when text really changed, we write it title-cased to match DB conventions.
# ---------------------------------------------------------------------------
ACRONYMS = {"PC", "PLLC", "LLC", "LLP", "LTD", "INC", "PA", "PS", "SC", "MD",
            "DO", "DPM", "II", "III", "IV", "USA", "LP", "PLC", "CRNA", "OB",
            "GYN", "ENT", "DDS", "DMD", "APC", "P.C.", "L.L.C."}


def smart_title(s):
    out = []
    for w in (s or "").split():
        out.append(w.upper() if w.upper().strip(".,") in ACRONYMS else w.capitalize())
    return " ".join(out)


def n_text(s):
    return re.sub(r"\s+", " ", (s or "").strip()).casefold()


def n_digits(s):
    return re.sub(r"\D", "", s or "")


def n_date(s):
    s = (s or "").strip()
    m = re.match(r"^(\d{2})/(\d{2})/(\d{4})$", s)      # MM/DD/YYYY (NPPES)
    if m:
        return f"{m.group(3)}-{m.group(1)}-{m.group(2)}"
    return s[:10]                                       # ISO from Postgres


def n_subpart(s):
    # DB stores YES/NO (from the API); the bulk file uses Y/N. Same fact.
    return (s or "").strip().upper()[:1]


def n_codeset(s):
    # all_taxonomy_codes: compare as an order-insensitive set of codes.
    return frozenset(c for c in (s or "").split("|") if c.strip())


# field -> (normalizer for comparison, writer for the new value)
FIELD_RULES = {
    "phone": (n_digits, lambda v: v),
    "fax": (n_digits, lambda v: v),
    "authorized_official_phone": (n_digits, lambda v: v),
    "postal_code": (lambda v: n_digits(v)[:5], lambda v: v),   # ZIP+4 churn isn't a change
    "organizational_subpart": (n_subpart, lambda v: v),
    "all_taxonomy_codes": (n_codeset, lambda v: v),
    "name": (n_text, smart_title),
    "address_1": (n_text, smart_title),
    "address_2": (n_text, smart_title),
    "parent_organization": (n_text, smart_title),
    "authorized_official_name": (n_text, smart_title),
    "authorized_official_title": (n_text, smart_title),
}
# nppes_last_updated never *triggers* an update on its own; it rides along.
# primary_taxonomy_code/desc are NEVER synced on existing rows: the DB stores
# the clinic's true primary specialty (with descriptions the bulk file doesn't
# carry); the sync only sets them when inserting brand-new clinics.
DIFF_FIELDS = [f for f in UPDATABLE
               if f not in ("nppes_last_updated", "primary_taxonomy_code", "primary_taxonomy_desc")]


def find_monthly_zip_url():
    log(f"Fetching NPPES files page: {NPPES_FILES_PAGE}")
    # Full monthly replacement file. NPPES retired the V1 format on 2026-03-03,
    # so the monthly file is now e.g. NPPES_Data_Dissemination_April_2026_V2.zip.
    links = []
    try:
        r = S.get(NPPES_FILES_PAGE, timeout=60)
        log(f"  page HTTP {r.status_code}, {len(r.text)} bytes")
        links = re.findall(r'href="([^"]*NPPES_Data_Dissemination[^"]*\.zip)"', r.text, re.I)
        log(f"  found {len(links)} NPPES_Data_Dissemination links: {links[:6]}")
    except Exception as e:
        log(f"  page fetch failed: {e}")
    candidates = [u for u in links
                  if "weekly" not in u.lower() and "deactivat" not in u.lower()]
    if candidates:
        url = candidates[0]
        if url.startswith("./"):
            url = "https://download.cms.gov/nppes/" + url[2:]
        elif not url.startswith("http"):
            url = "https://download.cms.gov/nppes/" + url.lstrip("/")
        return url

    # Fallback: the monthly file name is predictable — probe this month and the
    # few before it until one exists.
    log("  page scrape found no monthly link — probing predictable URLs instead")
    months = ["January", "February", "March", "April", "May", "June",
              "July", "August", "September", "October", "November", "December"]
    now = datetime.now(timezone.utc)
    y, m = now.year, now.month - 1  # 0-based index into months
    for _ in range(4):  # this month, then up to 3 back
        guess = f"https://download.cms.gov/nppes/NPPES_Data_Dissemination_{months[m]}_{y}_V2.zip"
        try:
            pr = S.get(guess, stream=True, timeout=60)
            ok = pr.status_code < 300
            pr.close()
            log(f"  probe {guess} -> HTTP {pr.status_code}")
            if ok:
                return guess
        except Exception as e:
            log(f"  probe {guess} -> {e}")
        m -= 1
        if m < 0:
            m, y = 11, y - 1
    sys.exit("Could not locate the NPPES monthly V2 zip by scrape or by probing — check "
             "https://download.cms.gov/nppes/NPI_Files.html manually.")


def download(url):
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)
    dest = os.path.join(DOWNLOAD_DIR, "nppes_monthly.zip")
    log(f"Downloading {url}")
    with S.get(url, stream=True, timeout=120) as r:
        r.raise_for_status()
        done = 0
        with open(dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 20):
                f.write(chunk)
                done += len(chunk)
                if done % (200 << 20) < (1 << 20):
                    log(f"  …{done >> 20} MB")
    log(f"Downloaded {done >> 20} MB")
    return dest


def iter_nppes_rows(zip_path):
    """Stream the main npidata CSV out of the zip without extracting."""
    zf = zipfile.ZipFile(zip_path)
    # Main data file is npidata_pfile_YYYYMMDD-YYYYMMDD.csv (V2 may add a
    # suffix) — match any npidata CSV that isn't the header-row file, and
    # skip the three reference files (othername/pl_pfile/endpoint).
    member = next((n for n in zf.namelist()
                   if "npidata" in n.lower() and n.lower().endswith(".csv")
                   and "fileheader" not in n.lower()), None)
    if not member:
        sys.exit(f"npidata_pfile CSV not found in zip. Contents: {zf.namelist()[:10]}")
    log(f"Streaming {member}")
    with zf.open(member) as raw:
        yield from csv.DictReader(io.TextIOWrapper(raw, encoding="latin-1", newline=""))


# ---------------------------------------------------------------------------
# Supabase I/O.
# ---------------------------------------------------------------------------
def fetch_existing():
    cols = ("npi,slug,name,address_1,address_2,city,state,postal_code,country,phone,fax,"
            "primary_taxonomy_code,primary_taxonomy_desc,all_taxonomy_codes,provider_credentials,"
            "authorized_official_name,authorized_official_title,authorized_official_phone,"
            "parent_organization,organizational_subpart,nppes_last_updated,"
            "zone_slug,zone_name,primary_npi,enumeration_type,nppes_active")
    out, offset, page = [], 0, 1000
    while True:
        r = S.get(f"{SUPABASE_URL}/rest/v1/clinics",
                  params={"select": cols, "order": "npi", "limit": page, "offset": offset}, timeout=120)
        r.raise_for_status()
        batch = r.json()
        out.extend(batch)
        if len(batch) < page:
            break
        offset += page
    log(f"Loaded {len(out)} existing clinic rows from Supabase")
    return out


def patch_clinic(npi, fields):
    if DRY_RUN:
        return
    r = S.patch(f"{SUPABASE_URL}/rest/v1/clinics", params={"npi": f"eq.{npi}"},
                headers={"Content-Type": "application/json", "Prefer": "return=minimal"},
                data=json.dumps(fields), timeout=60)
    if r.status_code >= 300:
        log(f"  !! PATCH {npi} failed {r.status_code}: {r.text[:200]}")


def insert_clinics(rows):
    if DRY_RUN or not rows:
        return
    for i in range(0, len(rows), 200):
        chunk = rows[i:i + 200]
        r = S.post(f"{SUPABASE_URL}/rest/v1/clinics",
                   headers={"Content-Type": "application/json", "Prefer": "return=minimal"},
                   data=json.dumps(chunk), timeout=120)
        if r.status_code >= 300:
            log(f"  !! INSERT batch failed {r.status_code}: {r.text[:300]}")


# ---------------------------------------------------------------------------
# Main sync.
# ---------------------------------------------------------------------------
def main():
    log(f"sync_nppes.py version {SYNC_VERSION}")
    if not SUPABASE_URL or not SERVICE_KEY:
        sys.exit("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.")
    if DRY_RUN:
        log("DRY RUN — nothing will be written.")

    existing = fetch_existing()
    by_npi = {str(c["npi"]): c for c in existing}
    wanted_types = {c.get("enumeration_type") for c in existing if c.get("enumeration_type")}
    log(f"Enumeration types in DB (new inserts limited to these): {sorted(wanted_types)}")

    # Dedup lookups from existing data → cluster primary.
    phone_zip, addr_zip = {}, {}
    for c in existing:
        prim = c.get("primary_npi") or c["npi"]
        pz = (norm_phone(c.get("phone")), zip5(c.get("postal_code")))
        if all(pz):
            phone_zip.setdefault(pz, prim)
        az = (norm_addr(c.get("address_1")), zip5(c.get("postal_code")), (c.get("city") or "").strip().upper())
        if all(az):
            addr_zip.setdefault(az, prim)

    # Zone lookups: state+zip3 (+city tie-break) → majority zone.
    zone_votes = defaultdict(Counter)          # (state, zip3) -> Counter(zone)
    zone_votes_city = defaultdict(Counter)     # (state, zip3, CITY) -> Counter(zone)
    for c in existing:
        if not c.get("zone_slug"):
            continue
        st, z3 = (c.get("state") or "").upper(), zip5(c.get("postal_code"))[:3]
        if not (st and z3):
            continue
        zone = (c["zone_slug"], c.get("zone_name") or "")
        zone_votes[(st, z3)][zone] += 1
        zone_votes_city[(st, z3, (c.get("city") or "").strip().upper())][zone] += 1

    def assign_zone(state, postal, city):
        st, z3, ci = (state or "").upper(), zip5(postal)[:3], (city or "").strip().upper()
        if zone_votes_city.get((st, z3, ci)):
            return zone_votes_city[(st, z3, ci)].most_common(1)[0][0]
        if zone_votes.get((st, z3)):
            return zone_votes[(st, z3)].most_common(1)[0][0]
        return None

    taken_slugs = {c["slug"] for c in existing if c.get("slug")}

    # ---- Stream the NPPES file --------------------------------------------
    zip_path = download(find_monthly_zip_url())
    seen_in_file, seen_as_pain = set(), set()
    updates, inserts, moved = 0, 0, 0
    new_rows, scanned = [], 0
    planned_updates = []                 # (npi, patch) — applied after the scan
    changed_fields = Counter()           # which fields actually change (diagnostics)
    diff_samples = []                    # a few example diffs for the summary
    new_by_code = Counter()              # new clinics by primary taxonomy code
    new_folded = 0                       # new NPIs that dedup into existing practices
    stamp = now_iso()

    for row in iter_nppes_rows(zip_path):
        scanned += 1
        if scanned % 1_000_000 == 0:
            log(f"  …scanned {scanned:,} rows")
        npi = (row.get("NPI", "") or "").strip()
        known = npi in by_npi
        if known:
            seen_in_file.add(npi)
        rec = parse_row(row)
        if rec is None:
            continue
        if known:
            seen_as_pain.add(npi)
            cur = by_npi[npi]
            patch, diffs = {}, []
            for k in DIFF_FIELDS:
                norm, writer = FIELD_RULES.get(k, (n_text, lambda v: v))
                if k == "nppes_last_updated":
                    continue
                newv, curv = rec.get(k) or "", "" if cur.get(k) is None else str(cur.get(k))
                cmp_new = n_date(newv) if k == "nppes_last_updated" else norm(newv)
                cmp_cur = n_date(curv) if k == "nppes_last_updated" else norm(curv)
                if cmp_new != cmp_cur:
                    patch[k] = writer(newv)
                    diffs.append((k, curv[:40], newv[:40]))
            if patch:
                changed_fields.update(k for k in patch)
                if len(diff_samples) < 5:
                    diff_samples.append((npi, cur.get("name", ""), diffs[:4]))
                # Clinic moved? Recompute zone; flag if we can't place it.
                if any(k in patch for k in ("city", "state", "postal_code")):
                    z = assign_zone(rec["state"], rec["postal_code"], rec["city"])
                    if z and z[0] != cur.get("zone_slug"):
                        patch["zone_slug"], patch["zone_name"] = z
                        patch["sync_note"] = "moved — zone reassigned by sync"
                    elif not z:
                        patch["zone_slug"] = None
                        patch["zone_name"] = None
                        patch["sync_note"] = "moved — no zone match, assign manually"
                    moved += 1
                patch["nppes_last_updated"] = rec.get("nppes_last_updated") or None
                patch["nppes_active"] = True
                patch["last_synced_at"] = stamp
                planned_updates.append((npi, patch))
                updates += 1
        else:
            # New pain clinic. Only insert the enumeration types the DB already uses.
            if rec["enumeration_type"] not in wanted_types:
                continue
            prim = phone_zip.get((norm_phone(rec["phone"]), zip5(rec["postal_code"])))
            if not prim:
                prim = addr_zip.get((norm_addr(rec["address_1"]), zip5(rec["postal_code"]),
                                     rec["city"].strip().upper()))
            slug = slugify(rec["state"], rec["city"], rec["name"]) or f"clinic-{npi}"
            if slug in taken_slugs:
                slug = f"{slug}-{npi[-4:]}"
            taken_slugs.add(slug)
            z = assign_zone(rec["state"], rec["postal_code"], rec["city"])
            new_by_code[rec["primary_taxonomy_code"]] += 1
            if prim:
                new_folded += 1
            else:
                # Register this new primary so later new NPIs at the same
                # phone/address fold into IT instead of duplicating.
                pz = (norm_phone(rec["phone"]), zip5(rec["postal_code"]))
                if all(pz):
                    phone_zip.setdefault(pz, int(npi))
                az = (norm_addr(rec["address_1"]), zip5(rec["postal_code"]),
                      rec["city"].strip().upper())
                if all(az):
                    addr_zip.setdefault(az, int(npi))
            new_rows.append({**rec,
                             "name": smart_title(rec["name"]),
                             "address_1": smart_title(rec["address_1"]),
                             "address_2": smart_title(rec["address_2"]),
                             "authorized_official_name": smart_title(rec["authorized_official_name"]),
                             "parent_organization": smart_title(rec["parent_organization"]),
                             "npi": int(npi),
                             "slug": slug,
                             "primary_npi": int(prim) if prim else int(npi),
                             "zone_slug": z[0] if z else None,
                             "zone_name": z[1] if z else None,
                             "sync_note": ("new from NPPES sync" + ("" if z else " — no zone match, assign manually")
                                           + ("; folded into existing cluster" if prim else "")),
                             "nppes_active": True,
                             "outreach_status": "not_contacted",
                             "data_source": "NPPES-sync",
                             "pulled_at": stamp,
                             "last_synced_at": stamp})
            inserts += 1

    # ---- Safety brake, then apply -----------------------------------------
    # If the plan wants to rewrite a large share of the DB, that's almost
    # certainly a formatting/parsing bug, not real-world change. Abort a live
    # run before writing anything (a dry run still reports everything).
    update_cap = max(150, len(existing) // 50)   # ~2% of rows
    brake = ""
    if updates > update_cap and not DRY_RUN:
        brake = (f"SAFETY BRAKE: {updates} planned updates exceeds the cap of {update_cap} "
                 f"(~2% of {len(existing)} rows). Nothing was written. Run a dry run, inspect "
                 f"the field breakdown below, and fix before going live.")
    else:
        for npi, patch in planned_updates:
            patch_clinic(npi, patch)
        insert_clinics(new_rows)

    # ---- Flags: vanished + taxonomy-changed -------------------------------
    deactivated, tax_changed = 0, 0
    for npi, cur in by_npi.items():
        if npi not in seen_in_file and cur.get("nppes_active") is not False:
            if not brake:
                patch_clinic(npi, {"nppes_active": False, "last_synced_at": stamp,
                                   "sync_note": "NPI absent from NPPES monthly file — likely deactivated; review"})
            deactivated += 1
        elif npi in seen_in_file and npi not in seen_as_pain:
            if not brake:
                patch_clinic(npi, {"last_synced_at": stamp,
                                   "sync_note": "still in NPPES but no pain taxonomy this month — review"})
            tax_changed += 1

    # ---- Summary + rebuild --------------------------------------------------
    fields_txt = ", ".join(f"{k}×{v}" for k, v in changed_fields.most_common(10)) or "—"
    codes_txt = ", ".join(f"{k}×{v}" for k, v in new_by_code.most_common()) or "—"
    samples_txt = "\n".join(
        f"    {npi} {name[:38]}: " + "; ".join(f"{k}: '{o}' -> '{n}'" for k, o, n in d)
        for npi, name, d in diff_samples) or "    —"
    summary = (f"NPPES sync v{SYNC_VERSION} {'(DRY RUN) ' if DRY_RUN else ''}complete — scanned {scanned:,} rows.\n"
               + (brake + "\n" if brake else "")
               + f"  updated: {updates} (of which moved: {moved})  [live cap: {update_cap}]\n"
               f"    fields changing: {fields_txt}\n"
               f"    sample diffs:\n{samples_txt}\n"
               f"  new clinics: {inserts} ({new_folded} fold into existing practices as duplicates;"
               f" {inserts - new_folded} brand-new pages)\n"
               f"    by taxonomy code: {codes_txt}\n"
               f"  flagged deactivated: {deactivated}\n"
               f"  flagged taxonomy-changed: {tax_changed}\n"
               f"Review notes in Supabase: select * from clinics where sync_note is not null;")
    log(summary)
    gh = os.environ.get("GITHUB_STEP_SUMMARY")
    if gh:
        with open(gh, "a") as f:
            f.write("```\n" + summary + "\n```\n")
    if brake:
        sys.exit(1)

    changed = updates + inserts + deactivated
    if changed and DEPLOY_HOOK and not DRY_RUN:
        log("Triggering Cloudflare rebuild…")
        try:
            requests.post(DEPLOY_HOOK, timeout=30)
            log("Rebuild triggered.")
        except Exception as e:
            log(f"Deploy hook failed (rebuild manually): {e}")
    elif not changed:
        log("No changes — skipping rebuild.")


if __name__ == "__main__":
    main()
