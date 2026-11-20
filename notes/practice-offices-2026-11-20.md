# Offices of a registry practice rank on the practice's record
## 2026-11-20

Rich's call, on the Houston inquiry of 2026-11-16: "If the parent has an NPI,
then shouldn't these be included? I would think they should qualify."

Until today a location with no registry record of its own was "listed, not
ranked", the same treatment as a practice with no NPI at all
(`notes/brand-names-and-nonregistry-listings-2026-11-16.md`). That was too
blunt. The ranking scores the practice: its registry specialty, whether it
carries the interventional code, how long it has been registered. Those are as
true at its second office as at its first. Most group practices bill every
office under one organization NPI and never file NPPES's optional secondary
locations. The practice in the inquiry is one: its record (NPI 1316348501,
primary registration Anesthesiology - Pain Medicine) lists one address, last
updated 2015, and no secondary locations; its website lists two other offices.

## The rule

A published listing with a `parent_npi` ranks as an office of that practice
when all of these hold:

1. **Pain medicine is the parent's primary registration** (`isPainPrimary`).
   A practice in the directory because pain is one of its fifteen declared
   codes does not lend its rank to new addresses.
2. **The practice confirmed the office** with us directly. The table already
   refuses `published` without `confirmed_on` / `confirmed_how`. The dashboard
   asks for confirmation from the practice's own address, not an agency's.
3. **The office appears on the practice's own website.**
   `office_evidence_url` is a page on that site; the build checks it is on the
   same site as the listing's or the parent's website.
4. **It ranks on the parent's registry signals only.** No Google rating,
   reviews or hours of its own: a loose address match is how 2,094 clinics
   once got the wrong hours (place-id provenance, 2026-08). It earns none of
   the 45 rating and review points. Transparency (website, phone) is its own.

Fail any of these and the row stays listed, not ranked, as before. The build
log says which rule it failed (`[offices] ... stays listed, not ranked: ...`).

Condition 3 is the guard against phantom offices: suites a practice barely
staffs, listed to appear in more towns. It is a common local-search tactic, and
the inquiry that prompted this came from a marketing agency.

## How it is built

- `practice_offices.sql` adds `office_evidence_url` to `nonregistry_listings`
  and appends it to the public view (read-only grants re-asserted). Safe in
  either order with the code.
- `src/lib/listing-rules.js` `officeProblems()` is the rule, pure and tested.
- `src/lib/data.js` `buildOffices()` turns a qualifying row into a clinic entry
  after the registry rows: the parent's registry fields, the office's own
  address, phone and coordinates, `npi: null`, `isOffice: true` and
  `officeOf` (the parent). So area pages, metro and topic pages, the map and
  the sitemap rank and list it with no changes of their own.
- `src/lib/listings.js` skips a row that became an office, so it is never on
  both `/clinic/` and `/listing/`.
- Page: `/clinic/<listing slug>/`. Under the name it says whose office it is,
  links the practice, boxes the explanation, makes every registry statement
  about the practice by name, and sends claims to the practice's page. The
  practice's page gains an "Other offices" list. Structured data names the
  practice as `parentOrganization`.
- The website link follows the practice: linked once the practice has claimed
  its listing and the site passes Safe Browsing, as for any clinic.
- Kept out: the Pain Care Deserts counts (registry records only, its published
  method), Practice Kit, Medicare (both keyed to an NPI and its enrollment).

## Not done

- Headline counts ("N clinics") include offices. There is one sample office
  and no real one yet; revisit if offices become numerous.
- An office has no rating path. Matching one to its Google profile by
  `google_place_id`, confirmed by hand, would be the way, and is its own change.
- If NPPES later lists an office as a secondary location, nothing notices.
