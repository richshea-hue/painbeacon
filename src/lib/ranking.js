// "Best qualified" ranking. Objective, checkable signals only — defensible the
// day ownership enters the picture. The weighting published on /how-we-rank MUST
// match this. Signals not yet in the data (insurance breadth, procedure count)
// are documented as "expanding" rather than faked.

const W = {
  interventional: 25, // carries the interventional pain taxonomy (208VP0014X)
  rating: 25,         // aggregate rating, scaled 0..5 -> 0..W
  reviews: 20,        // review volume, log-scaled and capped
  tenure: 15,         // years since NPI enumeration, capped at 20y
  transparency: 15,   // has website + phone (contactability/transparency)
};

const PAIN_INTERVENTIONAL = '208VP0014X';

export function scoreClinic(c) {
  let s = 0;
  const breakdown = {};

  const interventional =
    (c.primary_taxonomy_code === PAIN_INTERVENTIONAL ||
      (c.all_taxonomy_codes || '').includes(PAIN_INTERVENTIONAL))
      ? W.interventional : 0;
  breakdown.interventional = interventional;
  s += interventional;

  const rating = c.aggregate_rating ? (Number(c.aggregate_rating) / 5) * W.rating : 0;
  breakdown.rating = round(rating);
  s += rating;

  const rc = Number(c.review_count) || 0;
  const reviews = rc > 0 ? Math.min(1, Math.log10(rc + 1) / Math.log10(201)) * W.reviews : 0;
  breakdown.reviews = round(reviews);
  s += reviews;

  let years = 0;
  if (c.enumeration_date) {
    years = (Date.now() - new Date(c.enumeration_date).getTime()) / 3.15576e10;
  }
  const tenure = Math.min(1, Math.max(0, years) / 20) * W.tenure;
  breakdown.tenure = round(tenure);
  s += tenure;

  const transparency = ((c.website ? 0.5 : 0) + (c.phone ? 0.5 : 0)) * W.transparency;
  breakdown.transparency = round(transparency);
  s += transparency;

  return { score: round(s), breakdown };
}

const round = (n) => Math.round(n * 10) / 10;

// Stable sort: score desc, then review_count desc, then name asc.
export function rankClinics(list) {
  return [...list]
    .map((c) => ({ ...c, _rank: scoreClinic(c) }))
    .sort(
      (a, b) =>
        b._rank.score - a._rank.score ||
        (Number(b.review_count) || 0) - (Number(a.review_count) || 0) ||
        (a.name || '').localeCompare(b.name || '')
    );
}

export const RANK_WEIGHTS = W;
