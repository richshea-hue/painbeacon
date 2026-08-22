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
    // Hero photo credit. REQUIRED for Unsplash photos: their API Guidelines say
    // an app must attribute both the photographer and Unsplash, with a link back
    // to the photographer's profile, and that links back carry utm_source /
    // utm_medium=referral. Optional for Pexels, whose license does not require
    // it — we render it anyway when present. scripts/fetch-article-photo.mjs
    // prints these ready to paste.
    heroCreditName: z.string().optional(),
    heroCreditProfile: z.string().optional(), // photographer's profile page
    heroCreditPhoto: z.string().optional(), // the photo's own page
    heroCreditProvider: z.enum(['Unsplash', 'Pexels']).optional(),
  }),
});

export const collections = { articles };
