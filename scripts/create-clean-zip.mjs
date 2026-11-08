import { createWriteStream, existsSync, readdirSync, statSync, lstatSync, readlinkSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import archiver from 'archiver';

const root = 'c:\\Users\\Далер\\Documents\\Codex\\2026-10-28\\referenced-chatgpt-conversation-this-is-an\\outputs\\AI Hub';
const outZip = 'c:\\Users\\Далер\\Documents\\Codex\\2026-10-28\\referenced-chatgpt-conversation-this-is-an\\outputs\\AI-Hub-Windows.zip';

console.log('Archiving clean AI Hub for Windows...');
console.log('Target zip:', outZip);

const output = createWriteStream(outZip);
const archive = archiver('zip', {
  zlib: { level: 6 },
});

output.on('close', () => {
  const mb = (archive.pointer() / 1024 / 1024).toFixed(1);
  console.log(`Successfully created ${outZip} (${mb} MB, ${archive.pointer()} bytes)`);
});

archive.on('warning', (err) => {
  if (err.code === 'ENOENT') console.warn(err);
  else throw err;
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);

// Excluded patterns - strictly exclude user data, caches, mobile build files, and git
const excludeRoots = new Set([
  '.data',
  '.git',
  'android',
  'desktop-validation',
  'tests',
  'AI-Hub-Windows.zip',
]);

const items = readdirSync(root);
for (const item of items) {
  if (excludeRoots.has(item)) {
    console.log(`Skipping excluded: ${item}`);
    continue;
  }
  const fullPath = join(root, item);
  const st = lstatSync(fullPath);
  if (st.isDirectory()) {
    console.log(`Adding directory: ${item}`);
    archive.directory(fullPath, `AI Hub/${item}`);
  } else {
    console.log(`Adding file: ${item}`);
    archive.file(fullPath, { name: `AI Hub/${item}` });
  }
}

console.log('Finalizing archive (this may take 1-2 minutes)...');
await archive.finalize();
