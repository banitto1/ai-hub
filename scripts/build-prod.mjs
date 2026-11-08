import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const node = resolve(root, 'win-app/node.exe');
const next = resolve(root, 'node_modules/next/dist/bin/next');

console.log('Building Next.js production bundle...');
const out = execSync(`"${node}" "${next}" build`, {
  cwd: root,
  encoding: 'utf8',
  env: {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
  },
  stdio: 'inherit',
});
console.log('Build finished successfully.');
