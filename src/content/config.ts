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
    // Share/hero image. Defaults to the generated card /social/<slug>.png —
    // run `node scripts/generate-social-cards.mjs` after adding an article.
    // Set explicitly only to use a custom photo (still 1200×1200).
    image: z.string().optional(),
    imageAlt: z.string().optional(),
  }),
});

export const collections = { articles };
