import { defineCollection, z } from 'astro:content';

// The Beacon: article feed at /news. One .md per article in src/content/articles/.
// Weekly, quality-first posts for people deciding WHICH kind of pain clinic they
// need — the same guidance the chatbot gives, in durable long form.
const articles = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    dek: z.string(), // standfirst; doubles as meta description and RSS summary
    date: z.coerce.date(),
    // draft: true keeps the article out of the build entirely (page, feed,
    // sitemap, homepage) — see src/lib/articles.js. SHOW_DRAFTS=1 previews it.
    draft: z.boolean().optional(),
    category: z.enum(['Choosing a Clinic', 'Treatments Explained', 'Patient Guides', 'Inside the Rankings']),
    // Share card (og:image). Defaults to the generated card /social/<slug>.png —
    // run `node scripts/generate-social-cards.mjs` after adding an article.
    // Set explicitly only to use a custom card (still 1200×1200).
    image: z.string().optional(),
    imageAlt: z.string().optional(),
    // Article photo set — run `node scripts/prepare-article-images.mjs` to make
    // these from a source photo (hero 1600×900, thumb 600×600). heroAlt should
    // describe the photo in a full sentence — it's what image search indexes.
    heroImg: z.string().optional(),
    heroAlt: z.string().optional(),
    thumb: z.string().optional(),
    // 1200×1200 photo crop used as og:image and RSS enclosure — square so no
    // platform crops it, but real photography (user preference over the branded
    // card, which remains the site-wide default for non-article pages).
    shareImg: z.string().optional(),
    // Hotlinked Unsplash base URL (urls.raw). When set, the hero/thumb/share are
    // served from Unsplash's CDN with sizing params rather than from public/ —
    // their API Guidelines require every use of a photo to go through the
    // hotlinked url. Pexels photos leave this unset and keep local crops.
    heroRemote: z.string().optional(),
    // Hero photo credit. REQUIRED for BOTH providers, because we pull through
    // their APIs rather than downloading from their websites:
    //
    //   Unsplash — their API Guidelines require attributing the photographer AND
    //   Unsplash, linking to the photographer's profile, with utm_source and
    //   utm_medium=referral on links back.
    //
    //   Pexels — the Pexels LICENSE does not require attribution, which is what
    //   you find first and what an earlier version of this comment wrongly said.
    //   Their API guidelines are stricter: "whenever you are doing an API
    //   request, make sure to show a prominent link to Pexels", and "always
    //   credit photographers when possible".
    //
    // scripts/fetch-article-photo.mjs prints these ready to paste.
    heroCreditName: z.string().optional(),
    heroCreditProfile: z.string().optional(), // photographer's profile page
    heroCreditPhoto: z.string().optional(), // the photo's own page
    heroCreditProvider: z.enum(['Unsplash', 'Pexels']).optional(),
  }),
});

// Featured research at /research/<slug>/. One .md per study in
// src/content/research/: the frontmatter is the study AS PUBLISHED (title,
// authors, abstract — quoted, never edited), the body is OUR plain-English
// summary. The rules that make quoting somebody else's abstract legitimate —
// a reusable license or a recorded permission, and an abstract that still
// matches the hash taken when it was fetched — live in src/lib/research-rules.js
// and fail the build through src/lib/research.js.
//
// PainBeacon's own data studies (pain-care-deserts) are NOT in this collection.
// They are computed at build time from the directory and stay hand-built pages.
//
// New entries come from `npm run research:scaffold -- <PMID or DOI>`, which
// fills every quoted field from Europe PMC and the paper's own license block.
const research = defineCollection({
  type: 'content',
  schema: z.object({
    // --- ours ---------------------------------------------------------------
    headline: z.string(), // the page <title> and the card headline: the finding, in plain English
    dek: z.string(), // meta description
    cardDek: z.string().optional(), // longer standfirst for the /research/ card; falls back to dek
    date: z.coerce.date(), // the day WE featured it, not the day it was published
    draft: z.boolean().optional(), // true keeps it out of the build — see src/lib/research.js
    crumb: z.string().optional(), // short breadcrumb label; falls back to headline
    // Funding and conflicts of interest as the paper declares them, in our
    // words. Required before a licensed study can go live: a device trial
    // written by the manufacturer's employees is still worth featuring, but
    // not without saying so.
    disclosure: z.string().optional(),

    // --- the study, as published ----------------------------------------------
    studyTitle: z.string(),
    authors: z
      .array(z.object({ name: z.string(), url: z.string().url().optional() }))
      .min(1),
    journal: z.string(),
    publisher: z.string().optional(),
    year: z.number().int(),
    published: z.coerce.date().optional(), // the paper's own publication date, when known
    doi: z.string().optional(),
    pmid: z.string().optional(),
    pmcid: z.string().optional(),
    sourceUrl: z.string().url(), // the version of record
    // Everything up to the journal name: "Ray, B.M. (2026). Title in sentence case."
    // The template appends the journal in italics and the link.
    citation: z.string(),
    abstract: z.string(), // verbatim; paragraphs separated by a blank line
    abstractSha256: z.string().regex(/^[0-9a-f]{64}$/),

    // --- why we may print it ----------------------------------------------------
    license: z.enum(['CC BY', 'CC0', 'permission']),
    licenseUrl: z.string().url().optional(), // required unless license is "permission"
    copyright: z.string().optional(), // the paper's own copyright statement
    permissionNote: z.string().optional(), // who agreed, when, and to what. Not rendered.
    abstractCredit: z.string().optional(), // overrides the generated credit line
  }),
});

export const collections = { articles, research };
