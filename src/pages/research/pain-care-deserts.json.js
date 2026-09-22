// The Pain Care Deserts dataset as JSON — the machine-readable twin of
// /research/pain-care-deserts.csv, for the organizations that republish or
// analyze this rather than read it.
//
// Every input is federal public domain: clinic counts from the NPI registry
// (NPPES), county populations and the ZCTA crosswalk from the Census Bureau,
// county geometry from Census TIGERweb. Nothing Google-derived is in here.
// That distinction is the whole reason this file can exist while the clinic
// points behind /map/ cannot be redistributed: those coordinates and ratings
// come from Google Places, whose terms forbid passing them on.
//
// Shape: metadata, national totals, a row per state, and a row per county.
// The county rows are the same figures as the CSV, so a consumer can diff the
// two and get nothing.
//
// CORS: this is meant to be fetched from other people's pages, and the Access-
// Control-Allow-Origin header lives in public/_headers because Astro's static
// build discards headers set on this Response.
import { getDesertStats } from '../../lib/deserts.js';
import { SITE } from '../../lib/site.js';

export async function GET() {
  const S = await getDesertStats();

  const body = {
    dataset: 'Pain Care Deserts: U.S. counties with no pain management clinic',
    publisher: 'PainBeacon',
    url: `${SITE.url}/research/pain-care-deserts/`,
    license: 'CC BY 4.0',
    license_url: 'https://creativecommons.org/licenses/by/4.0/',
    attribution:
      `Shea, R. (${new Date().getFullYear()}). Pain Care Deserts: U.S. Counties With No Pain ` +
      `Management Clinic. PainBeacon. ${SITE.url}/research/pain-care-deserts/`,
    sources: [
      'NPPES — federal National Provider Identifier registry (clinic locations)',
      `U.S. Census Bureau vintage-${S.vintage} county population estimates`,
      'U.S. Census Bureau ZCTA-to-county crosswalk',
    ],
    definition:
      'A pain care desert is a county in the 50 states or DC with zero pain management ' +
      'clinics in the directory. Clinics are counted once per practice location and ' +
      "assigned to the county holding most of their ZIP code's land area.",
    census_vintage: S.vintage,
    generated_at: S.generatedAt,

    national: {
      counties: S.totalCounties,
      deserts: S.desertCount,
      desert_pct: S.desertPct,
      population: S.totalPop,
      desert_population: S.desertPop,
      desert_population_pct: S.desertPopPct,
      single_clinic_counties: S.singleClinicCount,
      single_clinic_population: S.singleClinicPop,
      clinics_total: S.totalClinics,
      clinics_mapped_to_a_county: S.mappedClinics,
    },

    states: S.states.map((s) => ({
      state: s.state,
      state_name: s.stateName,
      counties: s.counties,
      deserts: s.deserts,
      desert_pct: s.desertPct,
      clinics: s.clinics,
      population: s.pop,
      desert_population: s.desertPop,
      clinics_per_100k: s.per100k,
    })),

    counties: [...S.rows]
      .sort((a, b) => a.fips.localeCompare(b.fips))
      .map((r) => ({
        fips: r.fips,
        county: r.county,
        state: r.state,
        population: r.pop,
        pain_clinics: r.clinics,
        is_pain_care_desert: r.clinics === 0,
      })),
  };

  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
