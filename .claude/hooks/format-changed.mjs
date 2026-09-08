#!/usr/bin/env node
// PostToolUse hook: format the file that was just written with Biome (JS/TS/JSON/CSS)
// or rustfmt (Rust). Reads the tool payload from stdin; never fails the tool call.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
});
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(input || '{}');
    const file = payload?.tool_input?.file_path;
    if (!file || !existsSync(file)) return;
    if (/\.(ts|tsx|js|jsx|mjs|cjs|json|jsonc|css)$/.test(file)) {
      execFileSync('pnpm', ['exec', 'biome', 'format', '--write', file], { stdio: 'ignore' });
    } else if (file.endsWith('.rs')) {
      execFileSync('rustfmt', ['--edition', '2021', file], { stdio: 'ignore' });
    }
  } catch {
    // formatting is best-effort
  }
});
