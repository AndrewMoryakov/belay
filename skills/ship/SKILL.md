---
name: ship
description: Ship a feature branch safely — push, wait for CI, HARD-GUARD on the real CI conclusion being success, write the verified-green marker, then (with explicit confirmation) merge to the default branch and verify. Use whenever promoting work toward the default/production branch.
user-invocable: true
---

# /belay:ship — verified-green-before-merge

A disciplined promotion loop. The one rule it exists to enforce: **never merge to the
default branch until the real CI conclusion for that exact commit is `success`** — not a
watcher's exit code, not a printed echo, the actual conclusion. (Merging a red branch is a
classic, expensive mistake.)

## Procedure

1. **Pre-flight.** Confirm a clean tree (`git status --porcelain` empty) and that you are on
   a feature branch, not the default branch. Know the default branch:
   `git rev-parse --abbrev-ref origin/HEAD` (→ `origin/<default>`).

2. **Push** the feature branch to its remote.

3. **Find the CI run** for the pushed HEAD and **poll until it completes** (do not proceed
   while it is queued/in_progress). Detect the provider:
   - **GitHub** (`gh` present): `gh run list --branch <branch> --limit 1 --json databaseId,headSha`
     then poll `gh run view <id> --json status,conclusion`.
   - **GitLab** (`glab` present): `glab ci status` / `glab ci view`.
   - **Other / none:** fall back to opening the CI UI and asking the user to confirm the
     conclusion; do not fabricate a result.

4. **HARD GUARD.** Read the *actual* conclusion and gate on it literally:
   ```sh
   c=$(gh run view <id> --json conclusion -q .conclusion)
   [ "$c" = success ] || { echo "CI not green ($c) — STOP"; exit 1; }
   ```
   If it is anything other than `success`, STOP and report — do not merge.

5. **Write the verified-green marker** (this is what the merge-guard hook checks):
   record the verified SHA so the gate knows this exact commit is green.
   ```sh
   mkdir -p .claude && git rev-parse HEAD > .claude/.verified-green
   ```
   (Keep `.claude/.verified-green` out of version control — it is a local attestation, not
   shared state. Add it to `.gitignore` if needed.)

6. **Confirm before promoting.** Merging to the default branch is often an outward-facing,
   hard-to-reverse action (it may auto-deploy). Ask the user to confirm before the merge
   unless they have already authorised an unattended ship.

7. **Merge** the feature branch into the default branch (fast-forward where possible), then
   **push the default branch**.

8. **Verify downstream.** If a default-branch merge triggers its own CI/deploy, poll those
   too and HARD-GUARD their conclusions the same way. For a deployed service, verify health
   (e.g. `/healthz`, `/readyz`, or the project's equivalent) before declaring success.

## Notes

- The HARD GUARD gates on a **conclusion value read from `gh run view --json conclusion`** —
  never on a *completion signal that carries no conclusion* (a `gh run watch` exit code, a
  printed "done"). So if your poll loop in step 3 already read `--json status,conclusion`, that
  conclusion **is** the guard — gate on it directly; a second `gh run view` is redundant. Only
  re-query when the thing that told you the run finished was an exit code / watcher that can be
  0 on a non-success conclusion.
- One logical change per commit; write a descriptive multi-paragraph message.
- The companion **merge-guard** hook enforces step 4/5 passively: a `git merge <feature>`
  or a push onto the default branch is **blocked** (`deny`; soften with `BELAY_MERGE_GUARD=ask`)
  unless the marker matches the commit being promoted — the merged ref's tip for a merge, or
  HEAD for a push. This skill is how you produce that marker. (A `--no-ff` merge mints a
  brand-new merge commit that was never CI-verified, so pushing *it* is still blocked —
  expected: that commit's own CI hasn't run.)
