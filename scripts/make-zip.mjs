import { spawn } from 'node:child_process';
import { readdirSync, existsSync, unlinkSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const hubDir = 'c:\\Users\\Далер\\Documents\\Codex\\2026-10-28\\referenced-chatgpt-conversation-this-is-an\\outputs\\AI Hub';
const zipOut = 'c:\\Users\\Далер\\Documents\\Codex\\2026-10-28\\referenced-chatgpt-conversation-this-is-an\\outputs\\AI-Hub-Windows.zip';

if (existsSync(zipOut)) {
  console.log('Removing old zip...');
  unlinkSync(zipOut);
}

const exclude = new Set(['.data', 'android', 'desktop-validation', 'tests', '.git']);
const items = readdirSync(hubDir).filter(x => !exclude.has(x));

console.log('Packaging clean release with tar.exe...');
console.log('Excluded (user private data/tests/android dev):', Array.from(exclude).join(', '));
console.log('Included root items:', items.length);

const args = [
  '-a',
  '-c',
  '-f',
  zipOut,
  '--exclude', '.data',
  '--exclude', '.data/*',
  '--exclude', 'android',
  '--exclude', 'android/*',
  '--exclude', 'desktop-validation',
  '--exclude', 'desktop-validation/*',
  '--exclude', 'tests',
  '--exclude', 'tests/*',
  '--exclude', '.git',
  '--exclude', '.git/*',
  '-C',
  hubDir,
  ...items,
];

const start = Date.now();
const proc = spawn('tar.exe', args, { stdio: 'inherit', windowsHide: true });

proc.on('close', (code) => {
  if (code === 0) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const sizeMb = (statSync(zipOut).size / 1024 / 1024).toFixed(1);
    console.log(`\nSUCCESS: Archive created in ${elapsed}s: ${zipOut} (${sizeMb} MB)`);
  } else {
    console.error(`\nFAILED with exit code ${code}`);
    process.exit(code || 1);
  }
});
