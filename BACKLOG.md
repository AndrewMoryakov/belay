# belay — backlog

Known bugs, limitations, and ideas. Shipped behaviour is described in the README; history is
in the commit log.

## Bugs

### B1 — merge-guard false-positives when a commit message mentions the default branch
**Severity:** medium (annoying; trivially worked around). **Fix target:** v0.1.3.

A compound command like `git commit -m '…master…' && git push origin <feature>` is wrongly
flagged as a default-branch promotion, because `merge-guard.mjs` computes `namesDefault` via
`defRe.test(cmd)` over the **whole command string** — including the commit-message text — not
just the push refspecs. So pushing a *feature* branch with a commit message that happens to
contain the default-branch name ("master" / "main") gets blocked.

- **Workaround:** split `commit` and `push` into separate commands (the push command then has
  no default-branch name in it).
- **Fix:** compute `namesDefault` from the parsed push positionals / refspecs only — the code
  already parses `positionals` / `refspecs`, so stop matching over the entire `cmd`.
- Found dogfooding on FreedomTunnelPlatform, 2026-06-04.

## Limitations

### L1 — merge-guard doesn't fit a trunk-based / main-only repo
In a repo where every commit goes straight to the default branch (no feature branches —
belay's own repo is like this), *every* push is a default-branch promotion, and there can be
no pre-push verified-green marker because CI only runs *after* the push. So the guard either
always blocks or must be disabled.

- **Mitigation today:** set `BELAY_MERGE_GUARD=off` (or `ask`) for trunk-based repos, or write
  the `.claude/.verified-green` marker = HEAD as an author attestation before pushing.
- **Idea:** a "trunk mode" that gates on the *last pushed* commit's CI conclusion (post-hoc)
  rather than a pre-push marker, or a documented per-repo opt-out.

### L2 — `matcher: "*"` runs both PreToolUse hooks on every tool call
v0.1.2 switched the matcher to `"*"` for bulletproof firing across harnesses; the hooks
self-filter (return allow fast for non-git commands), but this still spawns two short-lived
node processes per tool call. Once the shell-tool name is confirmed stable across harnesses,
scope the matcher back to the shell tool(s) to cut the overhead.

## Ideas (not planned)

- A stack-specific companion pack (EF/.NET migration guard, per-user-SDK PATH fix) — kept out
  of the universal plugin deliberately; could ship as a separate add-on.
- A machine-readable state-preamble convention for auto-memory, so `verify-memory` can diff a
  structured header instead of prose.
- More CI providers for `ship` (currently GitHub `gh` / GitLab `glab` detection).
