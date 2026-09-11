#!/usr/bin/env node
/**
 * Downscales oversized images in public/images so pages load fast on rural
 * connections. Anything wider or taller than MAX is resized in place; JPEGs are
 * re-encoded at quality 82, PNGs are left as PNG. Safe to re-run.
 *
 * Usage: node scripts/optimize-images.mjs [dir]   (default: public/images)
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const MAX = 1800;
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dir = path.resolve(root, process.argv[2] ?? 'public/images');

let saved = 0, touched = 0;
async function walk(d) {
  for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'brand') await walk(p); continue; }
    if (!/\.(jpe?g|png)$/i.test(entry.name)) continue;
    const before = fs.statSync(p).size;
    const img = sharp(p, { failOn: 'none' });
    const meta = await img.metadata();
    const big = (meta.width ?? 0) > MAX || (meta.height ?? 0) > MAX;
    if (!big && before < 400_000) continue;
    const pipeline = img.rotate().resize({ width: MAX, height: MAX, fit: 'inside', withoutEnlargement: true });
    const buf = /\.png$/i.test(entry.name)
      ? await pipeline.png({ compressionLevel: 9, palette: true }).toBuffer()
      : await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    if (buf.length < before) { fs.writeFileSync(p, buf); saved += before - buf.length; touched++; }
  }
}
await walk(dir);
console.log(`optimized ${touched} images, saved ${(saved / 1024 / 1024).toFixed(1)} MB`);
