// What we can honestly say about insurance, and what we cannot.
//
// MEDICARE is knowable. scripts/medicare_match.py matches every clinic's NPI
// against the federal CMS Medicare Fee-For-Service Public Provider Enrollment
// file (sourced from PECOS, refreshed quarterly): 12,410 of 12,487 listable
// clinics are checked and 3,729 come back enrolled.
//
// The asymmetry matters more than the coverage. A hit means the NPI is in the
// federal enrollment file — solid. A miss means only that we did not find that
// NPI: the practice may bill Medicare under a group NPI, may have enrolled
// since the last quarterly refresh, or may simply not be enrolled. We cannot
// tell those apart, so a miss is NOT evidence of refusal and is never rendered
// as one. accepts() returns null for it, and the filter offers "Accepts
// Medicare" with no opposite chip.
//
// COMMERCIAL PLANS are not knowable from any free federal source. There is no
// national file saying which practices are in-network for Aetna or BCBS, and
// network status changes contract by contract. `accepted_insurance` exists on
// the record for exactly that reason and is empty for all 12,487: it can only
// be filled by the clinic itself through the claim form, or bought from a
// vendor. Until it is filled, we offer no commercial-plan filter — an empty
// or guessed one would send a patient to a clinic that bills them.

/**
 * Does this clinic accept Medicare? true | false | null (unknown).
 *
 * A clinic's own answer on its claim form always beats the federal match: it
 * knows its billing better than an NPI lookup can, and it is the only source
 * that can tell us "no" with authority.
 */
export function acceptsMedicare(c) {
  if (c.accepts_medicare_self_reported != null) return c.accepts_medicare_self_reported;
  return c.accepts_medicare_cms === true ? true : null;
}

/** Where the "yes" came from, for the line printed under the claim. */
export const medicareSource = (c) =>
  c.accepts_medicare_self_reported === true ? 'clinic' : 'cms';

/** The filter only ever selects a positive signal — see the note above. */
export const medicareAttr = (c) => (acceptsMedicare(c) === true ? '1' : null);
