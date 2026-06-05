// belay · hook smoke tests (node --test). No external deps; spins up throwaway git repos.
// Run: node --test hooks/hooks.test.mjs   (requires node + git on PATH)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOKS = dirname(fileURLToPath(import.meta.url));
const NODE = process.execPath;

// Run a hook with the given stdin JSON + extra env; capture {status, stdout, stderr}.
function runHook(file, { input = '', env = {} } = {}) {
  try {
    const stdout = execFileSync(NODE, [join(HOOKS, file)], {
      input, encoding: 'utf8', env: { ...process.env, ...env },
    });
    return { status: 0, stdout, stderr: '' };
  } catch (e) {
    return { status: e.status ?? 1, stdout: String(e.stdout || ''), stderr: String(e.stderr || '') };
  }
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
}

// Throwaway repo with a chosen default branch (+ optional feature branch & green marker).
function makeRepo({ def = 'main', feature = false, markerSha = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'belay-test-'));
  git(dir, 'init', '-b', def);
  git(dir, 'config', 'user.email', 'test@belay.test');
  git(dir, 'config', 'user.name', 'belay test');
  git(dir, 'config', 'init.defaultBranch', def); // makes detectDefault deterministic offline
  writeFileSync(join(dir, 'a.txt'), 'a');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-m', 'init');
  if (feature) {
    git(dir, 'checkout', '-b', 'feature');
    writeFileSync(join(dir, 'b.txt'), 'b');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-m', 'feat');
    git(dir, 'checkout', def);
  }
  if (markerSha) {
    mkdirSync(join(dir, '.claude'), { recursive: true });
    writeFileSync(join(dir, '.claude', '.verified-green'), markerSha);
  }
  return dir;
}
const rm = (dir) => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } };
const stdin = (command, cwd) => JSON.stringify({ tool_input: { command }, cwd });

// ── git-truth (SessionStart) ──────────────────────────────────────────────────

test('git-truth: emits structured additionalContext with branch + default', () => {
  const dir = makeRepo({ def: 'main' });
  try {
    const r = runHook('git-truth.mjs', { input: JSON.stringify({ cwd: dir }) });
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    const ctx = out.hookSpecificOutput?.additionalContext;
    assert.ok(ctx && ctx.includes('git ground-truth (belay)'), 'has belay snapshot');
    assert.ok(ctx.includes('Default branch: `main`'), 'reports the real default');
  } finally { rm(dir); }
});

test('git-truth: silent (no output) outside a git repo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'belay-nongit-'));
  try {
    const r = runHook('git-truth.mjs', { input: JSON.stringify({ cwd: dir }) });
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), '');
  } finally { rm(dir); }
});

test('git-truth: I3 — reports develop, never falls back to master', () => {
  const dir = makeRepo({ def: 'develop' });
  try {
    const r = runHook('git-truth.mjs', { input: JSON.stringify({ cwd: dir }) });
    const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
    assert.ok(ctx.includes('Default branch: `develop`'), 'no master fallback');
  } finally { rm(dir); }
});

// ── merge-guard (PreToolUse) ──────────────────────────────────────────────────

test('merge-guard: innocuous git command → allow (no output)', () => {
  const dir = makeRepo();
  try {
    const r = runHook('merge-guard.mjs', { input: stdin('git status', dir) });
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), '');
  } finally { rm(dir); }
});

test('merge-guard: bare push on default without marker → deny (default)', () => {
  const dir = makeRepo();
  try {
    const r = runHook('merge-guard.mjs', { input: stdin('git push', dir) });
    const out = JSON.parse(r.stdout);
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  } finally { rm(dir); }
});

test('merge-guard: C1 — merge of a marker-verified feature → allow (silent)', () => {
  const dir = makeRepo({ feature: true });
  try {
    // marker holds the feature tip; on the default branch `git merge feature` promotes that
    // SHA, so the guard (which resolves the merged ref) sees a match and stays silent.
    const featureSha = git(dir, 'rev-parse', 'feature');
    mkdirSync(join(dir, '.claude'), { recursive: true });
    writeFileSync(join(dir, '.claude', '.verified-green'), featureSha);
    const r = runHook('merge-guard.mjs', { input: stdin('git merge feature', dir) });
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), '', 'verified merge passes silently');
  } finally { rm(dir); }
});

test('merge-guard: merge of feature WITHOUT marker → deny (default)', () => {
  const dir = makeRepo({ feature: true });
  try {
    const r = runHook('merge-guard.mjs', { input: stdin('git merge feature', dir) });
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'deny');
  } finally { rm(dir); }
});

test('merge-guard: push of a non-default ref while on default → allow (no FP)', () => {
  const dir = makeRepo({ feature: true });
  try {
    const r = runHook('merge-guard.mjs', { input: stdin('git push origin feature', dir) });
    assert.equal(r.stdout.trim(), '', 'pushing feature is not promoting the default branch');
  } finally { rm(dir); }
});

test('merge-guard: FP — default name in a compound commit message must not flag a feature push', () => {
  const dir = makeRepo({ feature: true });
  try {
    git(dir, 'checkout', 'feature');
    // The default name ("main") appears ONLY in the commit-message text of a compound command
    // whose push targets `feature`. Matching the default against the whole command string
    // false-positived here; the match must be scoped to the push refspecs.
    const cmd = "git commit -m 'refactor main loop' && git push origin feature";
    const r = runHook('merge-guard.mjs', { input: stdin(cmd, dir) });
    assert.equal(r.stdout.trim(), '', 'commit-message text must not trip the default-branch match');
  } finally { rm(dir); }
});

test('merge-guard: pushing the default by name from a feature branch → deny (true positive kept)', () => {
  const dir = makeRepo({ feature: true });
  try {
    git(dir, 'checkout', 'feature');
    // The refspec genuinely names the default branch — this IS a promotion and must still fire.
    const r = runHook('merge-guard.mjs', { input: stdin('git push origin main', dir) });
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'deny',
      'a refspec that names the default branch must still be guarded');
  } finally { rm(dir); }
});

test('merge-guard: C2 — default branch name with parens does NOT crash', () => {
  const dir = makeRepo({ def: 'rel(1' });
  try {
    git(dir, 'checkout', '-b', 'feature');
    writeFileSync(join(dir, 'b.txt'), 'b'); git(dir, 'add', '-A'); git(dir, 'commit', '-m', 'f');
    git(dir, 'checkout', 'rel(1');
    const r = runHook('merge-guard.mjs', { input: stdin('git merge feature', dir) });
    assert.equal(r.status, 0, 'no SyntaxError crash');
    assert.ok(r.stderr === '' || !r.stderr.includes('SyntaxError'), 'no regex crash on stderr');
  } finally { rm(dir); }
});

test('merge-guard: M1 — deleting the default branch is not flagged as a promotion', () => {
  const dir = makeRepo();
  try {
    const r = runHook('merge-guard.mjs', { input: stdin('git push origin :main', dir) });
    assert.equal(r.stdout.trim(), '');
  } finally { rm(dir); }
});

test('merge-guard: BELAY_MERGE_GUARD=ask → advisory ask (opt-in soft mode)', () => {
  const dir = makeRepo();
  try {
    const r = runHook('merge-guard.mjs', { input: stdin('git push', dir), env: { BELAY_MERGE_GUARD: 'ask' } });
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'ask');
  } finally { rm(dir); }
});

test('merge-guard: BELAY_MERGE_GUARD=off → allow (disabled)', () => {
  const dir = makeRepo();
  try {
    const r = runHook('merge-guard.mjs', { input: stdin('git push', dir), env: { BELAY_MERGE_GUARD: 'off' } });
    assert.equal(r.stdout.trim(), '');
  } finally { rm(dir); }
});

// ── proxy-doctor (PreToolUse, opt-in) ─────────────────────────────────────────

test('proxy-doctor: off by default → allow (no output)', () => {
  const r = runHook('proxy-doctor.mjs', { input: stdin('git push origin main'), env: { HTTPS_PROXY: 'http://p:1' } });
  assert.equal(r.stdout.trim(), '');
});

test('proxy-doctor: opt-in + proxy + remote op → non-blocking advisory note', () => {
  const r = runHook('proxy-doctor.mjs', {
    input: stdin('git push origin main'),
    env: { BELAY_PROXY_GUARD: '1', HTTPS_PROXY: 'http://p:1' },
  });
  const out = JSON.parse(r.stdout);
  assert.ok(out.hookSpecificOutput.additionalContext.includes('proxy-doctor'), 'injects advisory context');
  assert.equal(out.hookSpecificOutput.permissionDecision, undefined, 'does not gate the command');
});

test('proxy-doctor: M2 — tool name inside a string is not a false positive', () => {
  const r = runHook('proxy-doctor.mjs', {
    input: stdin('echo "see curl docs at curl.se"'),
    env: { BELAY_PROXY_GUARD: '1', HTTPS_PROXY: 'http://p:1' },
  });
  assert.equal(r.stdout.trim(), '', 'curl mentioned in a string must not trigger');
});
