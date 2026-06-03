#!/usr/bin/env node
// belay · PreToolUse(Bash|PowerShell) hook  ·  OPT-IN
// Behind a TLS-breaking proxy (corporate / VPN / local mixed-proxy), remote network
// operations silently hang or fail handshake. When enabled (BELAY_PROXY_GUARD=1)
// this warns (permissionDecision "ask") before such an op if *_PROXY vars are set and the
// command does not already neutralise them. OFF by default — most proxies work fine and a
// universal hook should not nag. Any error → allow.

import { readFileSync } from 'node:fs';

const allow = () => process.exit(0);

if (process.env.BELAY_PROXY_GUARD !== '1') allow();

let data = {};
try { data = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { allow(); }

const ti = data.tool_input || {};
const cmd = ti.command || ti.script || ti.code || '';

// Remote network operations that actually break under a bad proxy.
const NET = /\b(git\s+(push|pull|fetch|clone)|gh\s|npm\s+(i|install|ci)|pnpm\s+(i|install)|yarn(\s+install)?|pip\s+install|poetry\s+(install|add)|dotnet\s+(restore|nuget)|nuget\s|cargo\s+(build|fetch|update|publish)|go\s+(get|mod)|curl\s|wget\s)/i;
if (!cmd || !NET.test(cmd)) allow();

const proxied = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']
  .filter((k) => process.env[k]);
if (!proxied.length) allow();

// Already neutralised inline? (clears or overrides the proxy in the command itself)
if (/(-c\s+https?\.proxy=|_PROXY\s*=\s*(''|""|\$null|;)|NO_PROXY|--noproxy)/i.test(cmd)) allow();

const reason =
  `belay proxy-doctor: ${proxied.join(', ')} set — this remote op may hang or fail TLS ` +
  `behind the proxy. Clear the *_PROXY vars for this command or override inline ` +
  `(e.g. \`git -c http.proxy= -c https.proxy= ...\`, or unset them in the shell first).`;

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'ask',
    permissionDecisionReason: reason,
  },
}));
process.exit(0);
