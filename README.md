# belay

A runtime safety layer for coding agents (Claude Code plugin). Stack-, CI-, and OS-agnostic —
no assumptions about your language, framework, CI provider, or repo. Distilled from real
agent-collaboration failure modes:

- **assert-before-verify** (claiming a state/outcome without checking ground truth),
- **merging a red branch** (trusting a watcher instead of the real CI conclusion),
- **vacuous-green tests** (passing regardless of whether the code works),
- **proxy-broken networking** (remote ops silently hanging behind a TLS-breaking proxy).

## What's inside

### Skills (run with `/belay:<name>`)
- **`ship`** — verified-green-before-merge: push → poll CI → HARD-GUARD on the real
  conclusion being `success` → write the green marker → (confirm) → merge to the default
  branch → verify downstream. Detects GitHub (`gh`) / GitLab (`glab`); degrades to a manual
  checklist otherwise.
- **`verify-memory`** — reconcile persisted memory/notes against git + CI ground truth
  before relying on them (the repeatable version of *"are you sure?"*).
- **`critical-review`** — adversarial review of a diff/commit with a hard focus on **test
  integrity**: *would each test fail if the code were broken?*

### Hooks (activate automatically on install)
- **`git-truth`** (SessionStart) — injects a compact git ground-truth snapshot (branch,
  HEAD, ahead/behind, default branch, dirty?) at the start of every session, so the agent
  reconciles memory against reality up front. Silent outside a git repo.
- **`merge-guard`** (PreToolUse) — when a shell command would promote work onto the default
  branch without a verified-green marker for that exact HEAD, it **asks for confirmation**
  (advisory) — or **blocks** it when run in hard mode. The marker is produced by `ship`.
- **`proxy-doctor`** (PreToolUse, **opt-in**) — warns before remote network ops when
  `*_PROXY` vars are set and the command doesn't neutralize them. Off by default.

## Install

Requires **Node.js** and **git** on `PATH` (the hooks are `.mjs` scripts; git is used for
ground truth).

```
/plugin marketplace add AndrewMoryakov/belay
/plugin install belay@belay
```

Hooks activate automatically. Skills appear in `/help` as `/belay:*`.

## Configuration (environment variables)

| Variable | Effect |
|---|---|
| `BELAY_HARD=1` | `merge-guard` **blocks** unverified default-branch promotion (exit 2) instead of asking. |
| `BELAY_PROXY_GUARD=1` | Enables `proxy-doctor` (off by default). |

## Conventions

- **`.claude/.verified-green`** — a local file holding the SHA whose CI was confirmed green.
  Written by `ship`, read by `merge-guard`. It is a per-clone attestation, not shared state —
  keep it out of version control (`echo ".claude/.verified-green" >> .gitignore`).

## Design notes

- Hooks **fail open**: any internal error (a non-git directory, or git/node being absent) is
  non-blocking — the tool/session proceeds and `git-truth` can never break session start. Each
  hook body is wrapped so even an unexpected throw exits 0 and allows.
- Git is invoked via `execFileSync` with argument arrays (no shell) — safe and free of
  cross-platform quoting pitfalls. Inspected command strings are only ever pattern-matched,
  never executed (branch names are regex-escaped before matching).
- Smoke-tested: `node --test hooks/hooks.test.mjs` spins up throwaway git repos and exercises
  every hook (branch / marker / paren-default / develop-default / non-git cases). Run it after
  any change.
- Hook output schemas vary slightly across Claude Code versions; these target recent
  versions (`permissionDecision` / `additionalContext`). If a hook ever misbehaves, it fails
  open (allows), never closed.

## License

MIT © Andrew Moryakov
