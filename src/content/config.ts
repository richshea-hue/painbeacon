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
    // Hero video (optional): plays muted/looped in place of the hero image on
    // the article page only. The hero PHOTO must stay set — it remains the
    // poster frame, og:image, thumb, and RSS enclosure, none of which can be a
    // video. Self-hosted mp4 under public/videos/ (≤ ~10MB; Cloudflare Pages
    // caps files at 25MB): Pexels is the only video source and its license
    // allows re-hosting, but the API guidelines still require the credit links
    // below. Unsplash has no video product, so heroVideo never collides with
    // the heroRemote hotlinking rule.
    heroVideo: z.string().optional(),
    heroVideoCreditName: z.string().optional(),
    heroVideoCreditProfile: z.string().optional(), // videographer's Pexels profile
    heroVideoCreditPage: z.string().optional(), // the video's own Pexels page
  }),
});

export const collections = { articles };
