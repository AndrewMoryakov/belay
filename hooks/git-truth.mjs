#!/usr/bin/env node
// belay · SessionStart hook
// Injects a compact git ground-truth snapshot into the session so the agent can
// reconcile any memory / notes against reality up front — automating the
// "are you sure that's the current state?" check. Never breaks session start:
// any error (incl. non-git dirs) exits 0 with no output.
//
// Uses execFileSync (no shell) — safe + cross-platform, no quoting pitfalls.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

function safe(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}

function main() {
  let cwd = process.cwd();
  try {
    const j = JSON.parse(readFileSync(0, 'utf8') || '{}');
    if (j && typeof j.cwd === 'string' && j.cwd) cwd = j.cwd;
  } catch { /* stdin may be empty; fall back to process.cwd() */ }

  const git = (...args) =>
    execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();

  // Universal: silently do nothing outside a git work tree.
  try { git('rev-parse', '--is-inside-work-tree'); } catch { return; }

  const branch = safe(() => git('rev-parse', '--abbrev-ref', 'HEAD'), 'unknown');
  const sha = safe(() => git('rev-parse', '--short', 'HEAD'), 'unknown');
  const dirty = safe(() => git('status', '--porcelain'), '') ? 'dirty' : 'clean';

  let def = safe(() => git('rev-parse', '--abbrev-ref', 'origin/HEAD').replace(/^origin\//, ''), '');
  if (!def) def = safe(() => { git('show-ref', '--verify', '--quiet', 'refs/heads/main'); return 'main'; }, '') || 'master';

  let track = '';
  const upstream = safe(() => git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'), '');
  if (upstream) {
    const counts = safe(() => git('rev-list', '--left-right', '--count', 'HEAD...@{upstream}'), '');
    if (counts) {
      const [ahead, behind] = counts.split(/\s+/);
      track = ` · ${ahead} ahead / ${behind} behind ${upstream}`;
    }
  }
  const last = safe(() => git('log', '-1', '--format=%s'), '');

  const ctx =
    `git ground-truth (belay): on \`${branch}\` @ \`${sha}\` (${dirty})${track}. ` +
    `Default branch: \`${def}\`.` + (last ? ` HEAD subject: "${last}".` : '') +
    ` Before trusting any memory/notes that assert a HEAD, branch, "merged" or "deployed" status, ` +
    `reconcile them against these facts (run /belay:verify-memory for a deeper check).`;

  process.stdout.write(JSON.stringify({ additionalContext: ctx }));
}

try { main(); } catch { /* never break session start */ }
process.exit(0);
