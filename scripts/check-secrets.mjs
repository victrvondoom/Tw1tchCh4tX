import { readdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';
const root = process.cwd(),
  skip = new Set([
    'node_modules',
    '.git',
    'dist',
    'coverage',
    'test-results',
    'playwright-report',
    'data',
    'gaze',
  ]);
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{50,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}\b/,
];
const problems = [];
let count = 0;
async function walk(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (skip.has(item.name) || item.isSymbolicLink()) continue;
    const path = join(dir, item.name),
      rel = relative(root, path);
    if (item.isDirectory()) {
      await walk(path);
      continue;
    }
    if (item.name.startsWith('.env') && item.name !== '.env.example') continue;
    if (
      !/\.(?:[cm]?[jt]sx?|json|md|ya?ml|html|css|svg|example)$/.test(item.name) &&
      !['Dockerfile', 'LICENSE'].includes(item.name)
    )
      continue;
    const text = await readFile(path, 'utf8');
    count++;
    if (patterns.some((p) => p.test(text))) problems.push(rel);
  }
}
await walk(root);
try {
  const tracked = execFileSync('git', ['ls-files', '-z'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).split('\0');
  for (const file of tracked)
    if (
      (/(^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith('.env.example')) ||
      /\.db(?:-|$)/.test(file)
    )
      problems.push(file);
} catch {
  /* Source archives may not contain git metadata. */
}
if (problems.length) {
  console.error('Potential secret/private data in: ' + [...new Set(problems)].join(', '));
  process.exitCode = 1;
} else console.info(`Scanned ${count} source/config files; no configured secret patterns found.`);
