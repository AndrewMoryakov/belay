#!/usr/bin/env node
// belay · PreToolUse(Bash|PowerShell) hook
// Guards promotion of work onto the default branch behind a verified-green-CI marker.
//   - default: BLOCK — permissionDecision "deny" (unbypassable; the reason is fed back so the
//     agent self-corrects). "ask" is advisory but auto-approved away in non-interactive /
//     auto-approve sessions, so it is opt-in: BELAY_MERGE_GUARD=ask. =off disables the guard.
// The marker (`.claude/.verified-green` = the verified-green SHA, written by /belay:ship)
// lets the command through silently when it matches the commit being promoted:
//   - a push to the default branch        → matched against current HEAD
//   - a `git merge <ref>` into the default → matched against the SHA <ref> resolves to
// Fail-open: any error → allow. git runs via execFileSync (no shell); the inspected
// command string is only ever pattern-matched, never executed.

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const allow = () => process.exit(0); // no stdout → tool proceeds

function main() {
  let data = {};
  try { data = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { return allow(); }

  const ti = data.tool_input || {};
  const cmd = ti.command || ti.script || ti.code || '';
  const cwd = (typeof data.cwd === 'string' && data.cwd) ? data.cwd : process.cwd();
  const mode = (process.env.BELAY_MERGE_GUARD || 'block').toLowerCase();
  if (['off', '0', 'false', 'no'].includes(mode)) return allow();
  if (!cmd || !/\bgit\b/.test(cmd)) return allow();

  const git = (...a) => {
    try { return execFileSync('git', a, { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim(); }
    catch { return ''; }
  };
  const gitOk = (...a) => {
    try { execFileSync('git', a, { cwd, stdio: 'ignore' }); return true; } catch { return false; }
  };
  if (!gitOk('rev-parse', '--is-inside-work-tree')) return allow();

  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  const def = detectDefault(git, gitOk);

  // Escape the branch name before building a RegExp — branch names may legally contain
  // regex metacharacters ( ( ) . * | etc.), which would otherwise crash or mis-match.
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const defRe = def && def !== 'unknown' ? new RegExp(`(^|[\\s:/])${esc(def)}(\\s|$|:)`) : null;

  // Evaluate each shell segment INDEPENDENTLY. Splitting on command separators (; && || | newline)
  // stops tokens from one subcommand leaking into another — e.g. `git stash push … ; git checkout
  // main` must not treat `main` as a push refspec — and lets us read each segment's own git
  // SUBCOMMAND, so `git stash push` (subcommand `stash`) is correctly NOT a remote push.
  const head = git('rev-parse', 'HEAD');
  const promoted = new Set([head].filter(Boolean));
  let pushesDefault = false;
  let mergesIntoDefault = false;

  for (const seg of cmd.split(/&&|\|\||[;\n|]/)) {
    const toks = seg.trim().split(/\s+/).filter(Boolean);
    const gi = toks.indexOf('git');
    if (gi < 0) continue;
    // The git subcommand is the first non-flag token after `git` (so `git stash push` → `stash`,
    // `git -C dir push` → `push`).
    const sub = toks.slice(gi + 1).find((tk) => !tk.startsWith('-')) || '';

    if (sub === 'push') {
      // Push positionals: `git push [remote] [refspec...]` — first positional is the remote.
      // A push naming a non-default refspec is NOT promoting the default (the `git push origin
      // feature` case), even while standing on the default.
      const pIdx = toks.indexOf('push', gi);
      const positionals = toks.slice(pIdx + 1).filter((tk) => tk && !tk.startsWith('-'));
      const refspecs = positionals.slice(1);
      // A branch delete (`--delete`/`-d`, or a `:ref` refspec) is not a promotion.
      if (/(^|\s)(--delete|-d)(\s|$)/.test(seg) || refspecs.some((r) => r.startsWith(':'))) continue;
      const namesDefault = !!defRe && refspecs.some((r) => defRe.test(r));
      if (namesDefault || (branch === def && refspecs.length === 0)) pushesDefault = true;
    } else if (sub === 'merge') {
      // Merge control verbs are not promotions.
      if (/(^|\s)--(abort|continue|quit)(\s|$)/.test(seg)) continue;
      if (branch === def) {
        mergesIntoDefault = true;
        // Resolve each merged ref to a commit SHA — the marker attests the feature tip, NOT the
        // pre-merge HEAD the guard sees right now.
        const mIdx = toks.indexOf('merge', gi);
        for (const tok of toks.slice(mIdx + 1)) {
          if (!tok || tok.startsWith('-')) continue;
          const sha = git('rev-parse', '--verify', '--quiet', `${tok}^{commit}`);
          if (sha) promoted.add(sha);
        }
      }
    }
  }

  if (!mergesIntoDefault && !pushesDefault) return allow();

  let verified = false;
  try {
    const p = join(cwd, '.claude', '.verified-green');
    verified = existsSync(p) && promoted.has(readFileSync(p, 'utf8').trim());
  } catch { /* treat as unverified */ }
  if (verified) return allow(); // green for the commit being promoted → silent

  const reason =
    `belay merge-guard: this promotes work onto the default branch \`${def}\`, but no ` +
    `verified-green-CI marker matches the commit being promoted (HEAD \`${(head || '?').slice(0, 7)}\`). ` +
    `Confirm CI conclusion == success for that SHA (e.g. \`gh run view --json conclusion\`) or run ` +
    `/belay:ship (writes the marker on green). Soften with BELAY_MERGE_GUARD=ask, or =off to disable.`;

  // Default "deny" blocks even in auto-approve / bypass modes and feeds the reason back so the
  // agent self-corrects. "ask" is advisory only (silently auto-approved in non-interactive
  // sessions), hence opt-in.
  const decision = mode === 'ask' ? 'ask' : 'deny';
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason },
  }));
}

// origin/HEAD → configured init.defaultBranch (if it exists) → first existing common name →
// "unknown". Never guesses `master`: a ground-truth tool must not assert a default it can't see.
function detectDefault(git, gitOk) {
  const d = git('rev-parse', '--abbrev-ref', 'origin/HEAD').replace(/^origin\//, '');
  if (d) return d;
  const cfg = git('config', '--get', 'init.defaultBranch');
  if (cfg && gitOk('show-ref', '--verify', '--quiet', `refs/heads/${cfg}`)) return cfg;
  for (const name of ['main', 'master', 'develop', 'trunk']) {
    if (gitOk('show-ref', '--verify', '--quiet', `refs/heads/${name}`)) return name;
  }
  return 'unknown';
}

try { main(); } catch { allow(); } // fail-open on any unexpected error
