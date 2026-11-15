// Rasterises the GNANOVA mark (see src/components/layout/Logo.tsx) into PWA PNG icons.
// Pure Node (zlib only) so no image tooling is required. Run: node scripts/generate-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BLUE = [37, 99, 235];
const NAVY = [11, 27, 51];
const WHITE = [255, 255, 255];
const TEAL = [94, 234, 212];

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const distSeg = (px, py, ax, ay, bx, by) => {
  const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
  return Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)));
};
const GAP_FROM = Math.atan2(22.5 - 32, 45 - 32);
const GAP_TO = Math.atan2(34 - 32, 47 - 32);
const ARC_ENDS = [GAP_FROM, GAP_TO].map((a) => [32 + 15 * Math.cos(a), 32 + 15 * Math.sin(a)]);

/** Colour of a point in the 64×64 logo coordinate space, or null if transparent. */
function sample(x, y, { fullBleed, bg }) {
  const inRounded = (() => {
    if (fullBleed) return true;
    const r = 14;
    const cx = Math.min(Math.max(x, r), 64 - r), cy = Math.min(Math.max(y, r), 64 - r);
    return x >= 0 && y >= 0 && x <= 64 && y <= 64 && Math.hypot(x - cx, y - cy) <= r;
  })();
  if (!inRounded) return null;
  if (Math.hypot(x - 32, y - 32) <= 4.5) return TEAL;
  const a = Math.atan2(y - 32, x - 32);
  const onArc = Math.abs(Math.hypot(x - 32, y - 32) - 15) <= 3.5 && !(a > GAP_FROM && a < GAP_TO);
  const onCap = ARC_ENDS.some(([ex, ey]) => Math.hypot(x - ex, y - ey) <= 3.5);
  const onBar = distSeg(x, y, 33, 34, 47, 34) <= 3.5;
  if (onArc || onCap || onBar) return WHITE;
  return bg;
}

function render(size, { fullBleed = false, bg = BLUE, inset = 0 } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const SS = 4;
  const scale = (64 + inset * 2) / size;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const x = (px + (sx + 0.5) / SS) * scale - inset;
        const y = (py + (sy + 0.5) / SS) * scale - inset;
        const c = sample(x, y, { fullBleed, bg }) ?? (fullBleed ? bg : null);
        if (c) { r += c[0]; g += c[1]; b += c[2]; a += 255; }
      }
      const n = SS * SS, i = (py * size + px) * 4;
      const cov = a / 255;
      buf[i] = cov ? Math.round(r / cov) : 0;
      buf[i + 1] = cov ? Math.round(g / cov) : 0;
      buf[i + 2] = cov ? Math.round(b / cov) : 0;
      buf[i + 3] = Math.round(a / n);
    }
  }
  return png(size, buf);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', render(192));
writeFileSync('public/icons/icon-512.png', render(512));
// Maskable: full-bleed background, mark inside the 80% safe zone.
writeFileSync('public/icons/maskable-512.png', render(512, { fullBleed: true, inset: 12 }));
writeFileSync('public/icons/apple-touch-icon.png', render(180, { fullBleed: true, inset: 6 }));
writeFileSync('public/icons/splash-mark-512.png', render(512, { fullBleed: true, bg: NAVY, inset: 40 }));
console.log('Icons written to public/icons');
