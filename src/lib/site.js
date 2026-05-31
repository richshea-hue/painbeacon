// Central site config. One national brand, one domain (see brief: do NOT
// fragment into micro-sites). Name is kept separate from "Candor" so the
// directory reads as neutral pre-acquisition.

export const SITE = {
  name: 'PainBeacon',
  legalName: 'PainBeacon Directory',
  url: 'https://painbeacon.com',
  tagline: 'Find the right pain clinic near you.',
  description:
    'An independent national directory of pain medicine clinics. Find ' +
    'board-certified, interventional pain specialists near you, ranked on ' +
    'objective, published criteria.',

  // E-E-A-T: real, named editorial accountability on every page (YMYL).
  // IMPORTANT: keep active=false until a real, named clinician agrees to review.
  // Never display a fabricated reviewer on a health site. When you retain one,
  // set active:true and fill name/credentials/bio with their real details.
  medicalReviewer: {
    active: false,
    name: '',
    credentials: '',
    bio: '',
  },
  editorial: {
    publisher: 'PainBeacon Directory',
    lastReviewed: '2026-05-29',
  },

  // ---- OWNERSHIP-DISCLOSURE TRIPWIRE -------------------------------------
  // Today: false (Candor owns zero clinics; rankings are genuinely neutral).
  // Flip to true the day the first acquisition closes. When true, the global
  // disclosure banner shows site-wide and per-clinic banners appear on any
  // record where candor_owned is true. The methodology page is already live.
  disclosureActive: false,
};
