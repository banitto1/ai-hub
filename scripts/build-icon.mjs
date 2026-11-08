import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function renderPng(size) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  const half = (size - 1) / 2, rad = size * 0.22;
  const star = (nx, ny, cx, cy, r) => {
    const dx = Math.abs(nx - cx) / r, dy = Math.abs(ny - cy) / r;
    if (dx > 1 || dy > 1) return 0;
    const d = Math.pow(dx, 0.55) + Math.pow(dy, 0.55);
    return Math.max(0, Math.min(1, (1 - d) * 4.5));
  };
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 4);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const p = row + 1 + x * 4;
      const qx = Math.max(0, Math.abs(x - half) - (half - rad));
      const qy = Math.max(0, Math.abs(y - half) - (half - rad));
      const dist = Math.hypot(qx, qy) - rad;
      const alpha = Math.max(0, Math.min(1, 0.5 - dist));
      if (alpha <= 0) continue;
      const nx = x / (size - 1), ny = y / (size - 1);
      const g = 1 - (nx * 0.45 + ny * 0.55);
      let r = 10 + g * 12, gr = 10 + g * 12, b = 12 + g * 14;
      const border = Math.max(0, 1 - Math.abs(dist + size * 0.025) / Math.max(1, size * 0.028));
      r += border * 46; gr += border * 46; b += border * 52;
      const glow = Math.max(0, 1 - Math.hypot(nx - 0.46, ny - 0.48) * 2.1);
      r += glow * 16; gr += glow * 16; b += glow * 18;
      const s = Math.min(1, star(nx, ny, 0.46, 0.50, 0.29) + star(nx, ny, 0.72, 0.28, 0.12));
      r = r * (1 - s) + 244 * s;
      gr = gr * (1 - s) + 244 * s;
      b = b * (1 - s) + 246 * s;
      raw[p] = Math.min(255, Math.round(r));
      raw[p + 1] = Math.min(255, Math.round(gr));
      raw[p + 2] = Math.min(255, Math.round(b));
      raw[p + 3] = Math.round(alpha * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
export function buildIcon(outPath) {
  const sizes = [16, 32, 48, 256];
  const pngs = sizes.map(renderPng);
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((s, i) => {
    const e = 6 + i * 16;
    header[e] = s === 256 ? 0 : s;
    header[e + 1] = s === 256 ? 0 : s;
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(pngs[i].length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += pngs[i].length;
  });
  writeFileSync(outPath, Buffer.concat([header, ...pngs]));
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const target = join(root, 'desktop', 'icon.ico');
  buildIcon(target);
  console.log('Created ' + target);
}
