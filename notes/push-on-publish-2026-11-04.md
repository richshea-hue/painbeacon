# Announcing articles by pushing, not by waiting to be polled

*2026-11-04. Replaces the plan to move the publish time earlier. Background on
why that plan failed is in the session notes for the 8:51 window investigation;
the short version is below.*

## What the problem actually was

dlvr.it posts at 08:51. The weekly articles were landing after that, so each one
waited a full day for the next poll — and an article that merges days after it
was written arrives with a stale `pubDate` and gets skipped entirely, which is
what happened on 2026-09-16.

The obvious fix, moving the article cron earlier, **cannot work for painbeacon.**
The publish trigger is not a clock. `weekly-beacon-article-draft` opens a
`news/draft-*` PR and explicitly does not merge; publication happens when Rich
merges. The last four weekly PRs took 1h31m, 6h16m, 1d3h and 8d3h from draft to
merge, and not one went live before 10:37 Eastern. Moving the cron changes when
the draft is written and nothing else.

So the clock was the wrong thing to chase. **bestraces** was a different case —
it pushes straight to main, so its commit is its publish — and was fixed
separately by moving `weekly-rundown-article` to `30 7 * * 2`.

## What this does instead

`announce-article.yml` already pushed to Bluesky and pinged the WebSub hub on
publish rather than waiting to be polled. This extends that to the two networks
dlvr.it was covering:

- `scripts/post-to-x.mjs`
- `scripts/post-to-facebook.mjs`

Both follow `post-to-bluesky.mjs` exactly: read the first item of the **live**
feed, ask the network whether that URL is already up, post if not. No state
file, so re-running is harmless and a missed week heals itself on the next
deploy. With their secrets unset each one prints what it would have sent and
exits 0, so this is inert until credentials exist and can be adopted one network
at a time.

**This does not make painbeacon publish earlier.** It makes the post fire when
the article goes live, at whatever hour that is. The merge click is still a human
one. What it removes is the poll window, permanently — which was the part that
actually cost an article its audience.

## Rich's list, in this order

1. **Turn off dlvr.it's Facebook and X channels.** Until this happens, adding
   either secret below means every article posts twice on that network. Nothing
   in the repo can do it.
2. Add the X secrets: `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`,
   `X_ACCESS_TOKEN_SECRET` (Settings → Secrets and variables → Actions).
3. Add `FACEBOOK_PAGE_ACCESS_TOKEN` — a **Page** token, not a user token,
   carrying all three of `pages_show_list`, `pages_read_engagement` and
   `pages_manage_posts`. The first two are dependencies of the third per Meta's
   permission reference, and granting only `pages_manage_posts` fails in a
   misleading way: without `pages_show_list` the Page never appears in
   `/me/accounts`, which looks like the account not being a Page rather than a
   permission that was not asked for. The Page id is read from
   `SITE.socials.facebook`, so there is nothing else to set.

## Three things that are not settled

**X costs money now.** It closed its free tier to new developers in February
2026. From X's own pricing page: `POST /2/tweets` is $0.015, but a post
**carrying a URL** is $0.200. Every article announcement carries a link, so
~$11/year at one a week including the duplicate-check reads. Small, but it needs
a payment card on the developer account and there is no free path.

**OAuth 1.0a is a load-bearing assumption.** The script signs with OAuth 1.0a
because OAuth 2.0 user tokens expire in two hours and rotate their refresh token
on every use — a GitHub Action has nowhere to write the new one back, so one
missed write kills it until someone re-authorizes by hand. OAuth 1.0a tokens do
not expire. But X's OpenAPI spec for the endpoint names OAuth 2.0 explicitly and
lists the other scheme only as a generic `UserToken / type: OAuth`. If this
returns 401 with credentials that look right, that is the thing to question
first. The signing itself is not the suspect: `scripts/lib/oauth1.test.mjs` pins
it against RFC 5849 §3.4.1's own worked example, including the repeated-parameter
and encoded-value cases our own requests never exercise.

**The Facebook account may not be a Page.** `src/lib/site.js` records it as
`facebook.com/profile.php?id=61592202442574`. That URL form is what Facebook
serves for any account without a vanity handle and does not distinguish a Page
from a personal profile. There is no API for posting to a personal profile —
Meta removed `publish_actions` in 2018 and never replaced it. dlvr.it can only
post to Pages and has been posting there, so it is very likely a Page, but it was
never confirmed and the first real run is the test. The script names this case
in its error output rather than leaving it to be debugged from a bare 400.

Separately, Meta's Pages API overview says all Page permissions require App
Review, while also saying apps in Development Mode can request any permission
from a user with a role on the app. Those are not the same claim and the docs do
not say the second covers production. Treat App Review as unknown until a token
has been tried.

## The bug this turned up on the way

`announce-article.yml` waited a flat `sleep 300` for the Cloudflare deploy.
Measured deploy windows, read from the `cloudflare-workers-and-pages[bot]` PR
comment (its `created_at` → `updated_at` span):

| PR | duration |
|---|---|
| #104 | **6m 10s** — overran the wait |
| #95 | 4m 23s |
| #92 | 2m 33s |

When the wait loses that race, **every** announcer reads the previous feed:
Bluesky posts last week's article and the WebSub ping is spent on an unchanged
feed. Silently — the steps go green either way, which is why it was never
noticed. `scripts/wait-for-article.mjs` now polls the live feed until it leads
with the article the checkout says should be newest, capped at 15 minutes and
never fatal. A 2m 33s deploy no longer costs five minutes of runner time either.

It derives the expected article from the frontmatter rather than from the push
diff, because the diff is wrong in both directions: publishing by flipping
`draft: true` to false is a modification, not an addition, and a typo fix to an
old article is a change that will never become the first feed item.

## Not done

- **bestraces has no announcer at all.** Porting this pattern there would make
  its 07:30 cron change unnecessary, which is the more durable fix, but it is a
  separate repo and a separate decision.
- Nothing here is exercised against a real credential. Every script has been run
  `--dry-run` against the live feed and the signing is tested against the RFC,
  but the first authenticated call will be the first authenticated call.
