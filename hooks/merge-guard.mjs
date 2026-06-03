#!/usr/bin/env node
// belay · PreToolUse(Bash|PowerShell) hook
// Guards promotion of work onto the default branch behind a verified-green-CI marker.
//   - default mode: ADVISORY — permissionDecision "ask".
//   - hard mode (BELAY_HARD=1): BLOCKS (exit 2) until verified.
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

  const isPush = /\bgit\b[^\n]*\bpush\b/.test(cmd);
  const isMerge = /\bgit\b[^\n]*\bmerge\b/.test(cmd);

  // Not green-gated promotions: a branch delete, or merge control verbs.
  if (isPush && (/(^|\s)(--delete|-d)(\s|$)/.test(cmd) || /(^|\s):\S/.test(cmd))) return allow();
  if (isMerge && /(^|\s)--(abort|continue|quit)(\s|$)/.test(cmd)) return allow();

  // Escape the branch name before building a RegExp — branch names may legally contain
  // regex metacharacters ( ( ) . * | etc.), which would otherwise crash or mis-match.
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const defRe = def && def !== 'unknown' ? new RegExp(`(^|[\\s:/])${esc(def)}(\\s|$|:)`) : null;
  const namesDefault = !!defRe && defRe.test(cmd);

  // Push positionals: `git push [remote] [refspec...]` — first positional is the remote.
  // A push that names a non-default refspec is NOT promoting the default branch, even
  // when you happen to be standing on it (avoids the `git push origin feature` false-positive).
  const toks = cmd.split(/\s+/);
  const pIdx = toks.indexOf('push');
  const positionals = pIdx >= 0 ? toks.slice(pIdx + 1).filter((t) => t && !t.startsWith('-')) : [];
  const refspecs = positionals.slice(1);

  const mergesIntoDefault = isMerge && branch === def;
  const pushesDefault = isPush && (namesDefault || (branch === def && refspecs.length === 0));
  if (!mergesIntoDefault && !pushesDefault) return allow();

  // Which SHA(s) would this command promote? Pass if the verified marker is among them.
  const head = git('rev-parse', 'HEAD');
  const promoted = new Set([head].filter(Boolean));
  if (isMerge) {
    // Resolve each non-flag token to a commit SHA — covers `git merge <feature>`, where the
    // marker attests the feature tip (NOT the pre-merge HEAD the guard sees at this moment).
    for (const tok of toks) {
      if (!tok || tok.startsWith('-') || ['git', 'merge', 'push', 'origin'].includes(tok)) continue;
      const sha = git('rev-parse', '--verify', '--quiet', `${tok}^{commit}`);
      if (sha) promoted.add(sha);
    }
  }

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
    `/belay:ship, which writes the marker only on green.`;

  if (process.env.BELAY_HARD === '1') {
    process.stderr.write(reason + '\n');
    process.exit(2); // blocking
  }
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: reason },
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
