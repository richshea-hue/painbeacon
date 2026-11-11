# The Beacon — article calendar

Topic queue for the weekly Wednesday article. The scheduled draft routine takes
the FIRST unchecked topic, writes it, and checks it off with the publish date.
Add, remove, or reorder topics freely — the routine always takes the top
unchecked one. Keep one topic per line.

## CHECK FOR AN OPEN DRAFT BEFORE WRITING ANYTHING

The checkoff below is committed ON THE DRAFT BRANCH, so `main` does not learn a
topic is taken until that PR MERGES. An unmerged draft therefore leaves its topic
still unchecked here, and the next run picks the same one again.

That is not hypothetical. PRs #15 (2026-08-05), #21 (2026-08-12) and #28
(2026-08-18) were three independent articles on the same topic, written three
weeks running because #15 was never merged. Nothing published for three weeks
while all three sat open, and all three wrote the same path and the same slug,
so at most one could ever ship. #28 was merged on 2026-08-22; #15 and #21 were
closed unmerged. PR #6 was an earlier instance of the same loop.

So, before writing: list this repo's OPEN pull requests and look for any whose
head branch starts with `news/draft-`. Use whatever GitHub access the session
has — the GitHub MCP tools (`list_pull_requests`, state `open`) or `gh pr list
--state open`.

- An open `news/draft-*` PR exists → do not write a second article. If it
  passes every condition under "MERGE AUTOMATICALLY" below, merge it and stop
  for this run — one article a week, and the next run takes the next topic.
  If it fails any condition, STOP, leave it alone, and report the open PR and
  the reason.
- No open draft → proceed with the top unchecked topic below, and merge the
  finished PR under the same conditions.

## MERGE AUTOMATICALLY

Rich's standing instruction, given 2026-11-11 after the routine stopped on
PR #110 and waited for him: "Merge it. Do this automatically in the future."
Before that date the rule was that merging was always his call; this section
replaces that rule, and it overrides any older wording — in this file or in a
stored routine prompt — that says not to merge.

Merging publishes to painbeacon.com/news/ and announces the article on Facebook
and X, and none of that can be taken back. So the routine merges a weekly
article PR only when ALL of these hold:

- The head branch is `news/draft-*` and the PR changes nothing except one
  article in `src/content/articles/`, its images under `public/images/news/`,
  `data/image-registry.json`, and the checkoff line in this file.
- GitHub reports it mergeable with no conflicts, and every check on the head
  commit has finished green.
- Every verification step the routine runs before opening a PR passed. For a
  draft left by an earlier run, re-run them on that branch rather than trusting
  the PR description.
- No review comment or PR comment from a human is unanswered.
- `date:` and the checkoff date are the merge day (see the next section). If
  the draft has sat, re-date it on its branch first and wait for the checks.

Squash-merge, as the rest of this repo's history does. Then confirm the article
is on `main`, and tell Rich what was published, with the link.

If any condition fails, do not merge and do not work around it. Leave the PR
open and tell Rich which condition failed. To go back to manual merging, delete
this section and restore the STOP wording in the guard above.

### If the GitHub API is unreachable

Fall back to plain git, which needs no API. Do NOT skip the check and do NOT
assume there is no open draft.

A `news/draft-*` branch existing is NOT by itself a live draft — spent branches
outlive their PRs. As of 2026-08-22 four such branches are still on the remote
and every one of them is spent; a bare `ls-remote` check would stop the routine
every week for nothing. Two tests make a branch spent:

    git fetch -q origin main
    for b in $(git ls-remote --heads origin 'refs/heads/news/draft-*' \
                 | awk '{print $2}' | sed 's|refs/heads/||'); do
      git fetch -q origin "$b"; s=$(git rev-parse FETCH_HEAD)
      # 1. Already merged into main (a merge-commit PR leaves the branch an ancestor).
      git merge-base --is-ancestor "$s" origin/main && continue
      # 2. Superseded: the article it adds is already published on main. This is
      #    what a squash-merged PR, or a closed duplicate, leaves behind.
      art=$(git diff --name-only origin/main...FETCH_HEAD -- 'src/content/articles/*.md' | head -1)
      [ -n "$art" ] && git cat-file -e "origin/main:$art" 2>/dev/null && continue
      echo "LIVE DRAFT: $b ($art)"
    done

Anything printed is a real unfinished draft → STOP, exactly as for an open PR.
Nothing printed → proceed.

If you can reach neither the API nor the remote, stop and say so.

One unmerged draft stalls the entire queue, so the fix is always to resolve the
open PR — never to write around it.

## DATE THE ARTICLE THE DAY IT PUBLISHES, NOT THE DAY IT WAS WRITTEN

`date:` in the frontmatter becomes that item's `<pubDate>` in `dist/rss.xml`
(see `src/pages/rss.xml.js`), and dlvr.it posts to Facebook and X off that feed.
A feed poller judges an item by its date: one that shows up already a week old
reads as backfill rather than news, and gets passed over. So an article whose
`date:` is older than the day it reaches `main` can publish to the site
perfectly — right page, right feed position, valid enclosure — and still never
reach either social account.

That is not hypothetical either. The spinal cord stimulator article was written
and dated 2026-09-16, sat as PR #55 for a week, and merged on 2026-09-23 still
carrying the older date. Nothing was wrong with the feed; dlvr.it simply did not
consider a seven-day-old item new. Re-dating it to the merge day was the fix.

So:

- Writing a draft → date it today, as usual.
- Merging a draft that has sat → BEFORE merging, set `date:` to the merge day
  and move this file's checkoff date to match. One line in each file.

That is also the more honest date: nobody could read the article until it
merged.

- [x] How to choose a pain clinic (Choosing a Clinic) — 2026-07-16
- [x] What interventional pain clinics do (Treatments Explained) — 2026-07-16
- [x] Your first pain clinic appointment (Patient Guides) — 2026-07-16
- [x] Does insurance cover pain management? Referrals, prior auth, and costs (Patient Guides) — 2026-07-22
- [x] Red flags: how to spot a pill mill before you book (Choosing a Clinic) — 2026-07-30
- [x] How we rank pain clinics — and why nobody can buy a spot (Inside the Rankings) — 2026-08-18
- [x] Epidural steroid injections: what the evidence actually says (Treatments Explained) — 2026-08-26
- [x] Sciatica: when to see a pain specialist vs. wait it out (Patient Guides) — 2026-09-02
- [x] Pain management without opioids: what modern clinics actually offer (Treatments Explained) — 2026-09-09
- [x] Spinal cord stimulators: who they're for and what a trial involves (Treatments Explained) — 2026-09-23
- [x] Questions to ask before agreeing to any pain procedure (Patient Guides) — 2026-10-01
- [x] Radiofrequency ablation for back and neck pain: what it is and who it helps (Treatments Explained) — 2026-10-07
- [x] Who's who at a pain clinic: anesthesiologists, physiatrists, neurologists and other pain specialists (Choosing a Clinic) — 2026-10-14
- [x] Reading pain clinic reviews: what star ratings can and can't tell you (Inside the Rankings) — 2026-10-21
- [x] Telehealth for chronic pain: what can and can't happen by video (Patient Guides) — 2026-11-05
- [x] Knee pain: when a pain clinic can help, and when to see an orthopedist (Patient Guides) — 2026-11-11
- [ ] Nerve blocks explained: diagnostic vs. therapeutic, and why the difference matters (Treatments Explained)
