#!/usr/bin/env node
// belay · PreToolUse(Bash|PowerShell) hook
// Guards promotion of work onto the default branch behind a verified-green-CI marker.
//   - default mode: ADVISORY — returns permissionDecision "ask" (the user must confirm).
//   - hard mode (BELAY_HARD=1): BLOCKS (exit 2) until the marker matches HEAD.
// The marker (`.claude/.verified-green` = the SHA whose CI was confirmed green) is written
// by the /belay:ship skill. Any error → allow (never wedge the agent).
//
// The inspected command string is only ever regex-matched, never executed. git is run via
// execFileSync (no shell) with constant argument arrays — safe + cross-platform.

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const allow = () => process.exit(0); // no stdout → tool proceeds

let data = {};
try { data = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { allow(); }

const ti = data.tool_input || {};
const cmd = ti.command || ti.script || ti.code || '';
const cwd = (typeof data.cwd === 'string' && data.cwd) ? data.cwd : process.cwd();

if (!cmd || !/\bgit\b/.test(cmd)) allow();

const git = (...args) => {
  try { return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim(); }
  catch { return ''; }
};
if (!git('rev-parse', '--is-inside-work-tree')) allow();

const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
const def = (git('rev-parse', '--abbrev-ref', 'origin/HEAD').replace(/^origin\//, '')) || 'main';
const defRe = new RegExp(`(^|[\\s:/])${def}(\\s|$|:)`);

// Does the command promote work onto the default branch?
const mergesIntoDefault = /\bgit\b[^\n]*\bmerge\b/.test(cmd) && branch === def;
const pushesDefault = /\bgit\b[^\n]*\bpush\b/.test(cmd) && (defRe.test(cmd) || branch === def);
if (!mergesIntoDefault && !pushesDefault) allow();

// Verified-green marker for this exact HEAD?
const head = git('rev-parse', 'HEAD');
let verified = false;
try {
  const p = join(cwd, '.claude', '.verified-green');
  verified = existsSync(p) && readFileSync(p, 'utf8').trim() === head;
} catch { /* treat as unverified */ }
if (verified) allow(); // green for this SHA → let it through silently

const reason =
  `belay merge-guard: this promotes work onto the default branch \`${def}\`, ` +
  `but there is no verified-green-CI marker for HEAD \`${head.slice(0, 7)}\`. ` +
  `Confirm the CI conclusion == success for this SHA (e.g. \`gh run view --json conclusion\`) ` +
  `or run /belay:ship, which writes the marker only on green.`;

if (process.env.BELAY_HARD === '1') {
  process.stderr.write(reason + '\n');
  process.exit(2); // blocking
}

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'ask',
    permissionDecisionReason: reason,
  },
}));
process.exit(0);
