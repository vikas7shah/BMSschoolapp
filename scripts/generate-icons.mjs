/**
 * Draws the app icon at the sizes a home-screen install needs and writes real
 * PNGs — no image dependency, just zlib and the PNG spec.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'public');

const SAGE = [63, 111, 82];
const CREAM = [250, 247, 242];
const CLAY = [196, 100, 60];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  // rows are prefixed with filter byte 0 (none)
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Coverage-based anti-aliasing: sample each pixel on a 3x3 grid. */
function draw(size, shader) {
  const px = Buffer.alloc(size * size * 4);
  const S = 3;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const c = shader((x + (sx + 0.5) / S) / size, (y + (sy + 0.5) / S) / size);
          r += c[0]; g += c[1]; b += c[2]; a += c[3] ?? 255;
        }
      }
      const n = S * S;
      const i = (y * size + x) * 4;
      px[i] = Math.round(r / n);
      px[i + 1] = Math.round(g / n);
      px[i + 2] = Math.round(b / n);
      px[i + 3] = Math.round(a / n);
    }
  }
  return px;
}

const dist = (x, y, cx, cy) => Math.hypot(x - cx, y - cy);

/**
 * A bowl of fruit on sage: a filled circle for the bowl and a smaller one for
 * the fruit above it. Maskable, so everything stays inside the safe area.
 */
function icon(u, v) {
  // Bowl body: lower half-disc.
  if (v > 0.52 && dist(u, v, 0.5, 0.52) < 0.27) return CREAM;
  // Bowl rim.
  if (v > 0.48 && v < 0.55 && Math.abs(u - 0.5) < 0.30) return CREAM;
  // Fruit.
  if (dist(u, v, 0.5, 0.36) < 0.115) return CLAY;
  if (dist(u, v, 0.355, 0.42) < 0.075) return CREAM;
  if (dist(u, v, 0.645, 0.42) < 0.075) return CREAM;
  return SAGE;
}

mkdirSync(OUT, { recursive: true });
for (const size of [180, 192, 512]) {
  writeFileSync(join(OUT, `icon-${size}.png`), png(size, draw(size, icon)));
  console.log(`wrote icon-${size}.png`);
}

// Favicon at 32px for browser tabs.
writeFileSync(join(OUT, 'icon-32.png'), png(32, draw(32, icon)));
console.log('wrote icon-32.png');
