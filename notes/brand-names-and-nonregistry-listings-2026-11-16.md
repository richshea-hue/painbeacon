# Brand names, and practices that are listed but not ranked
## 2026-11-16

Two changes, built together because one inquiry needed both.

A marketing firm wrote in through `/for-practices/` on 2026-11-16 to say a
Houston-area pain practice was missing from the Katy page and had "no NPI
record at that suite, so there is nothing for us to claim". Half of that was
right. The Katy suite has no registry record. The practice does: it has been
in the directory all along under its legal name, which is not the name on its
door or its website, at an address the registry last saw updated in 2015. The
owner's name and the phone number on the federal record both match the
practice's own site.

So the request was two different problems:

1. **A registry clinic nobody can find**, because the registry's legal name is
   not the name patients search for.
2. **A location with no registry record of its own**, which is the same
   problem the 2026-10-21 chiropractic inquiry raised and
   `notes/claim-blooming-chiropractic-2026-11-09.md` section 9 left as "decided
   in principle, nothing built".

Rich's instruction: let a practice have the name people look for, keep the
corporate name so both are searchable, and build the unranked listing as a
system, "as I think we will be getting more of these".

---

## 1. Brand names

`clinics.brand_name`, added by `brand_name.sql` and appended to
`clinics_public`.

The rules live in `src/lib/data.js` (`cleanBrandName`, `brandNameOf`,
`publicName`, `registeredAs`) and are pinned by `src/lib/brand-name.test.mjs`:

- **Verified listings only.** A brand name is self-reported. It prints only
  when `listing_tier` is verified, enhanced or featured, which means it
  arrived through a claim that was confirmed with the practice. Drop a listing
  back to free and the registered name returns on the next build without
  anyone clearing the column.
- **The registered name never goes away.** Wherever the brand name leads, the
  registered name follows, labeled: under the H1 on the profile ("Registered in
  the federal NPI registry as ..."), on every card, in the meta description and
  the first FAQ answer, in structured data as `legalName` and `alternateName`,
  and in the map's search index (`map-clinics.json` slot 13), which now matches
  either name. That is the provenance, and it is also the thing that makes the
  practice findable under both.
- **The slug does not change.** It was minted from the registered name and is
  what the NPI maps to in kit links, badge links and the sitemap.
- **Only a name is accepted.** No links, email addresses, phone numbers or
  markup; 2 to 80 characters; and not the registered name retyped, which would
  print "Foo, registered as Foo".
- **Printed as typed.** `displayName` would turn "iSpine" into "Ispine".

How it gets set:

- The claim form on every clinic page has a new optional field, "Name patients
  know you by". It is **not a new column on `claims`**. The value is folded
  into the message as one labeled line (`Known to patients as: ...`), because
  that form is the anonymous public write and a column the database does not
  have yet would turn every claim into a silent 400. The dashboard reads the
  line back and offers it, editable, next to the approve button.
- Any verified listing can have its brand name set, changed or cleared from the
  "Paid & featured listings" section of the dashboard.

The registry sync (`scripts/sync_nppes.py`) patches a fixed list of fields and
does not know this column exists, so a monthly resync leaves it alone.

**Not done:** NPPES publishes "doing business as" names for some
organizations (`other_names` in the registry API). Importing those would give
many practices a second searchable name with federal provenance and no claim
needed. The practice in this case has none on file, so it would not have
helped here, and it is a sync change with its own review. Worth doing
separately.

---

## 2. Non-registry listings ("listed, not ranked")

### What it is

A practice, or one location of a practice, that asked to be listed and has no
record of its own in the federal NPI registry.

It does **not** go in `clinics`. That table's only key is the NPI, every page
built from it says the listing comes from the registry, the ranking scores a
taxonomy code such a row would not honestly carry, and the sync would flag it
for review every month. A hand-typed row there would be the first one whose
provenance is "someone told us".

So it is a separate kind of thing all the way down:

| layer | clinics | non-registry listings |
|---|---|---|
| table | `clinics` (key: NPI) | `nonregistry_listings` (key: uuid, unique slug) |
| what the build reads | `clinics_public` | `nonregistry_listings_public` (published rows, public columns) |
| loader | `src/lib/data.js` | `src/lib/listings.js` |
| page | `/clinic/<slug>/` | `/listing/<slug>/` |
| on an area page | the ranked, numbered list | its own section at the bottom, unnumbered |
| ranked / scored | yes | never; it is not passed to the ranking at all |
| on the national map | yes | no |
| badge | "Verified clinic" (after a claim) | "Listed on PainBeacon" |
| structured data | `MedicalClinic` | `LocalBusiness` |
| website link | followed, verified listings only | nofollow, and only if Safe Browsing passes |

### What a listing page says

The first thing under the address is a boxed note: this practice asked to be
listed; it has no record of its own in the federal registry (or, for an extra
location, the practice does and this location does not); our rankings are
built from the registry, so it is shown separately and is not ranked; the
details were supplied by the practice and confirmed with it directly; we have
not reviewed its credentials or care.

There is no score, rank, rating, Verified badge, claim form or
registry-derived FAQ on the page, because none would be true.

### The word "verified"

It does not travel with a listing, by the same reasoning as the 2026-11-09
note. The badge is a second asset (`public/brand/listed-badge.svg`) that says
"Listed on" and has no check mark. The label on the site is "Listed · not
ranked", in amber, never the teal of Verified. And a listing's own description
may not use *verified*, *ranked*, *top-rated*, *#1* or *board-certified*:
`listingProblems()` rejects it, because the page it would sit on says the
opposite.

### Confirmation is enforced by the database

Both inquiries so far came from someone other than the practice's own address:
a free webmail account, and a marketing firm's outreach inbox. So the table
carries `confirmed_on` and `confirmed_how` and has a check constraint that
refuses `status = 'published'` without them. The dashboard says the same thing
in words before it tries. Neither column is in the public view.

### Extra locations

`parent_npi` points a listing at the registry clinic it belongs to. The
listing page then says whose location it is and links to that clinic; the
clinic's page gains an "Other locations" block linking back. It is a pointer
for display only. Nothing is copied between the rows, and the listing is still
unranked: the registry vouches for the practice, not for a suite it has never
heard of.

### Where a listing appears

Zones are assigned to registry clinics by the sync, so a listing has none of
its own. `zoneClinicFor()` borrows one from the registry clinics around it,
nearest evidence first: same ZIP, then same city, then same 3-digit ZIP area,
always within the same state. No match means the listing has its own page and
appears on no area page. It is never guessed across a state line.

### Running it

Dashboard, section "Listed, not ranked":

1. On an inquiry in "Claim requests", **＋ List, not ranked** opens the form
   filled in from the inquiry. Or open the form directly.
2. Check the registry first. If the practice has an NPI with a pain taxonomy
   it belongs in the ranked directory and should claim its listing instead.
3. **Save as draft.** Saving never publishes.
4. Confirm with the practice itself, record the date and how, then set the
   status to **published** and rebuild.
5. To take one down, set it to **removed**. There is no delete: a removed row
   is the record that it was once published.

A row that does not hold together is skipped at build time with a
`[listings] SKIPPED` warning rather than failing the build. One mistyped
hand-entered row should not stop a 15,000-page directory from deploying.

---

## 3. Order of operations

Both SQL files are safe to run before or after the code is deployed.

- Before `brand_name.sql`: the build reads the view with `select=*`, so
  `brand_name` is simply undefined and every page prints what it printed
  before. The dashboard's brand field reports that the column is missing if
  used.
- Before `nonregistry_listings.sql`: the build logs one line and publishes no
  listings; the dashboard section says it is not set up yet.

`brand_name.sql` replaces `clinics_public`. It appends one column to the live
definition as read back with `pg_get_viewdef` on 2026-11-16, and re-asserts
`security_invoker = off` in the same run, which is the setting that took every
deploy down with 42501 when it was flipped once before.

## 4. Decisions made here that are Rich's to overrule

- **Listings are indexable and in the sitemap.** They are few, each one
  hand-reviewed, and being findable is the reason a practice asks.
- **A listing's website link is nofollow.** The followed link stays what a
  registry clinic earns by claiming.
- **Listings are not on the national map.** Its results list is ordered by
  score, and a listing has none.
- **Scope is not decided by the schema.** A chiropractor, a physical therapist
  and a second office all fit the table. Which of them get listed is decided
  one request at a time in the dashboard. The site copy says "a practice, or
  one of your locations"; it does not advertise the directory as open to every
  kind of provider.
- **No Practice Kit, no Medicare self-report, no paid tiers** for a listing.
  All three are keyed to an NPI.

## 5. Not verified

- **Both SQL files were run on production on 2026-11-16**, at Rich's
  instruction, and checked afterwards: `clinics_public` still reads
  `{security_invoker=off}` with all 14,697 rows and 44 columns, and the anon
  key reads `brand_name` through it. With the anon key, the new public view
  returns 200 and an empty list; reading the table, and inserting, updating or
  deleting through either the table or the view, all return 401 / 42501.
- That last check caught a real defect in the first version of
  `nonregistry_listings.sql`: the public view was writable. Supabase grants
  anon INSERT, UPDATE and DELETE on new views by default, a one-table view is
  auto-updatable, and a definer view writes past RLS. It was closed with a
  REVOKE in the same sitting, before any row existed, and the file now carries
  the revoke and the reason. **Any future one-table public view needs the same
  two lines.**
- Supabase's Security Advisor will list `nonregistry_listings_public` as a
  "Security Definer View", as it does `clinics_public`. That is the intended
  design. Accepting its suggested fix flips `security_invoker` on, which is
  the change that once took every deploy down with 42501.
- The dashboard changes were syntax-checked and read, not exercised signed in.
  The dashboard needs an admin session and, for the new section, the table.
- The local build uses fictional sample data: one sample clinic carries a
  brand name and two sample listings exist (one an extra location, one
  independent) so every new template renders locally.
- If a listed practice later registers an NPI and appears in `clinics`, there
  will be two rows for it. Nothing detects that yet; the listing would be set
  to `removed` by hand.
