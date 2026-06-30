// Generate WebP thumbnails for the catalog GRID (the high-image-count "big page")
// while leaving the ORIGINAL images untouched for the detail modal. Thumbs go in
// products/thumbs/<name>.webp (~240px, the card display size at retina). Repeatable
// — run after adding product images:  node web/scripts/optimize-images.mjs
import sharp from 'sharp';
import { readdir, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));     // web/scripts
const DIR = path.join(HERE, '..', 'public', 'products');       // web/public/products
const THUMBS = path.join(DIR, 'thumbs');
const THUMB_W = 240; // card displays max ~116px CSS → 240px covers 2x retina
const Q = 80;

await mkdir(THUMBS, { recursive: true });
const files = (await readdir(DIR)).filter((f) => /\.(jpe?g|png)$/i.test(f));
let origBytes = 0, thumbBytes = 0, n = 0;
for (const f of files) {
  const src = path.join(DIR, f);
  const out = path.join(THUMBS, f.replace(/\.(jpe?g|png)$/i, '.webp'));
  origBytes += (await stat(src)).size;
  await sharp(src).resize({ width: THUMB_W, withoutEnlargement: true }).webp({ quality: Q }).toFile(out);
  thumbBytes += (await stat(out)).size;
  n++;
}
console.log(`thumbs: ${n} generated. originals ${(origBytes/1048576).toFixed(2)}MB kept; thumbs total ${(thumbBytes/1048576).toFixed(2)}MB (grid now loads ~${Math.round(thumbBytes/n)}B/card avg vs ${Math.round(origBytes/n)}B).`);
