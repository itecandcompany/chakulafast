/**
 * Generates the PWA icon set into public/.
 *
 * Deliberately dependency-free: Node's zlib is all a PNG encoder actually
 * needs, so the icons can be regenerated on any machine (and in CI) without
 * pulling in sharp/canvas and their native build steps.
 *
 *   npm run gen:icons
 *
 * Shapes are drawn analytically and 4x supersampled, so edges stay smooth at
 * every size rather than looking like a scaled-up bitmap.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

// ChakulaFast spice orange (matches --primary in src/styles.css).
const BRAND = [0xc1, 0x44, 0x0e];
const WHITE = [0xff, 0xff, 0xff];

// ---------- minimal PNG encoder ----------

let CRC_TABLE;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[i] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([len, typed, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // 10..12 = compression / filter / interlace, all 0

  // Each scanline is prefixed with its filter byte (0 = none).
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- the mark: a white "C" on a spice-orange tile ----------

/**
 * The C is an annulus with a wedge cut out of its right side — the same
 * construction at every size, so it stays optically identical from a 32px
 * favicon up to the 512px maskable tile.
 */
function makeGlyphTest(S, glyphH) {
  const cx = S / 2;
  const cy = S / 2;
  const outer = glyphH / 2;
  const inner = outer * 0.58;
  const gapRad = (38 * Math.PI) / 180;

  return (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > outer || d < inner) return false;
    return Math.abs(Math.atan2(dy, dx)) > gapRad;
  };
}

function renderIcon(size, { maskable = false } = {}) {
  const SS = 4; // supersample factor
  const S = size * SS;

  // A maskable icon is cropped to whatever shape the OS wants, so it must
  // bleed to the edges and keep its content inside the middle 80% safe zone.
  const radius = maskable ? 0 : S * 0.22;
  const inGlyph = makeGlyphTest(S, S * (maskable ? 0.44 : 0.56));

  const inTile = (x, y) => {
    if (maskable) return true;
    const cx = Math.min(Math.max(x, radius), S - radius);
    const cy = Math.min(Math.max(y, radius), S - radius);
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= radius * radius;
  };

  const out = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let tile = 0;
      let glyph = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = px * SS + sx + 0.5;
          const y = py * SS + sy + 0.5;
          if (inTile(x, y)) {
            tile++;
            if (inGlyph(x, y)) glyph++;
          }
        }
      }
      const total = SS * SS;
      const tileA = tile / total;
      const glyphA = glyph / total;
      const i = (py * size + px) * 4;
      // Composite: glyph over tile, whole thing over transparency.
      for (let c = 0; c < 3; c++) {
        const blended = BRAND[c] * (tileA - glyphA) + WHITE[c] * glyphA;
        out[i + c] = tileA > 0 ? Math.round(blended / tileA) : 0;
      }
      out[i + 3] = Math.round(tileA * 255);
    }
  }
  return encodePng(size, size, out);
}

/**
 * Link-preview card (WhatsApp, Twitter/X, Facebook). 1200x630 is the size
 * every scraper expects; anything else gets cropped unpredictably.
 */
function renderOgImage(width = 1200, height = 630) {
  const SS = 2;
  const W = width * SS;
  const H = height * SS;

  // Matches --gradient-hero in src/styles.css.
  const FROM = [0xc1, 0x44, 0x0e];
  const TO = [0x8a, 0x2f, 0x08];

  const inGlyph = makeGlyphTest(H, H * 0.48);
  // makeGlyphTest centres on a square; recentre horizontally for the wide card.
  const shift = (W - H) / 2;

  const out = Buffer.alloc(width * height * 4);
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      let glyph = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          if (inGlyph(px * SS + sx + 0.5 - shift, py * SS + sy + 0.5)) glyph++;
        }
      }
      const a = glyph / (SS * SS);
      // Diagonal gradient, so the flat background still has some depth.
      const ramp = (px / width + py / height) / 2;
      const i = (py * width + px) * 4;
      for (let c = 0; c < 3; c++) {
        const bg = FROM[c] + (TO[c] - FROM[c]) * ramp;
        out[i + c] = Math.round(bg * (1 - a) + WHITE[c] * a);
      }
      out[i + 3] = 255;
    }
  }
  return encodePng(width, height, out);
}

// ---------- emit ----------

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  ["favicon-32.png", 32, {}],
  ["favicon-192.png", 192, {}],
  ["apple-touch-icon.png", 180, {}],
  ["icon-192.png", 192, {}],
  ["icon-512.png", 512, {}],
  ["icon-maskable-512.png", 512, { maskable: true }],
];

for (const [name, size, opts] of targets) {
  const buf = renderIcon(size, opts);
  writeFileSync(join(OUT_DIR, name), buf);
  console.log(`  ${name.padEnd(24)} ${size}x${size}  ${(buf.length / 1024).toFixed(1)} kB`);
}

const og = renderOgImage();
writeFileSync(join(OUT_DIR, "og-image.png"), og);
console.log(`  ${"og-image.png".padEnd(24)} 1200x630  ${(og.length / 1024).toFixed(1)} kB`);

console.log(`\nWrote ${targets.length + 1} images to public/`);
