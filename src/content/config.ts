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
  }),
});

export const collections = { articles };
