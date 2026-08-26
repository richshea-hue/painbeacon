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

- An open `news/draft-*` PR exists → STOP. Do not write a second article on the
  same topic. Report the open PR and ask whether to merge it, rebase it, or
  close it. That decision is the human's, not the routine's.
- No open draft → proceed with the top unchecked topic below.

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

- [x] How to choose a pain clinic (Choosing a Clinic) — 2026-07-16
- [x] What interventional pain clinics do (Treatments Explained) — 2026-07-16
- [x] Your first pain clinic appointment (Patient Guides) — 2026-07-16
- [x] Does insurance cover pain management? Referrals, prior auth, and costs (Patient Guides) — 2026-07-22
- [x] Red flags: how to spot a pill mill before you book (Choosing a Clinic) — 2026-07-30
- [x] How we rank pain clinics — and why nobody can buy a spot (Inside the Rankings) — 2026-08-18
- [x] Epidural steroid injections: what the evidence actually says (Treatments Explained) — 2026-08-26
- [ ] Sciatica: when to see a pain specialist vs. wait it out (Patient Guides)
- [ ] Pain management without opioids: what modern clinics actually offer (Treatments Explained)
- [ ] Spinal cord stimulators: who they're for and what a trial involves (Treatments Explained)
- [ ] Questions to ask before agreeing to any pain procedure (Patient Guides)
