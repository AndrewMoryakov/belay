---
name: verify-memory
description: Reconcile persisted memory/notes against git + CI ground truth before relying on them. Use when about to act on a remembered state (HEAD, branch, "merged", "deployed", test counts), when claiming work is durably recorded, or whenever the remembered state might have drifted from reality.
user-invocable: true
---

# /belay:verify-memory — reconcile memory against ground truth

Memory and hand-written notes drift: they describe what was true when written. Acting on a
stale "HEAD is X" / "C2 is not merged" / "deployed" claim causes real mistakes. This skill
turns the manual *"are you sure?"* into a repeatable check.

## What to check

For every concrete state claim in the loaded memory / current-state notes, find the
**ground truth** and compare. Do not assert durability without doing this.

| Claim in memory | Ground truth to fetch |
|---|---|
| current HEAD / SHA | `git rev-parse HEAD` (and `--short`) |
| current branch | `git rev-parse --abbrev-ref HEAD` |
| "branch X merged to default" | `git branch --merged <default>` contains X? / `git log --oneline <default> | grep` |
| "pushed" / ahead-behind | `git rev-list --left-right --count HEAD...@{upstream}` |
| "nothing uncommitted" | `git status --porcelain` is empty |
| test counts ("131 green") | re-run the project's fast test slice, or treat the number as stale |
| "deployed" / "CI green" | the CI provider (`gh run view --json conclusion`), and a live health probe if applicable |
| "prod is on SHA Y" | the deploy source of truth (release tag, running image, `/healthz` build info) |

## Procedure

1. **Gather git truth** (the SessionStart `git-truth` hook already surfaces a summary —
   start from it, then dig deeper as needed).
2. **Read the memory / current-state block** that the next session will trust.
3. **Diff each claim** against the fetched truth. Flag every mismatch.
4. **Fix the drift at the source** — update the memory/notes so the stored state matches
   reality (correct the HEAD, the merged/deployed status, the counts). Keep a tiny
   machine-checkable preamble if the project uses one, e.g.:
   `state: branch=<b> head=<sha> default=<d> tests=<n> updated=<iso>`
5. **Only then** make claims like "everything important is recorded" — and say plainly what
   is in durable storage (git commits + messages) vs. memory vs. repo docs, and what lives
   only in the volatile conversation.

## Red flags that should trigger this skill

- "Everything is saved / we won't lose anything on compact" — verify before asserting.
- A remembered SHA/branch/"merged"/"deployed" you are about to act on.
- A memory index line that contradicts the current-state block (indexes go stale fastest).
