/**
 * RAIJIN icon generator — Node.js only, no npm packages.
 * Outputs icon16.png, icon48.png, icon128.png into ./icons/
 * Pure black background + electric blue lightning bolt + blue glow.
 * 4× supersampling for crisp edges.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

// ── CRC32 ──────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ── PNG encoder ────────────────────────────────────────────────────────────
function pngChunk(type, data) {
  const lenBuf  = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcVal  = Buffer.alloc(4);
  crcVal.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcVal]);
}

function encodePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0; // filter: None
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const d = y * (1 + w * 4) + 1 + x * 4;
      raw[d] = rgba[s]; raw[d+1] = rgba[s+1]; raw[d+2] = rgba[s+2]; raw[d+3] = rgba[s+3];
    }
  }
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Image operations ───────────────────────────────────────────────────────
function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

/** Scanline-fill a polygon into buf (Uint8Array RGBA, w×h). */
function fillPolygon(buf, w, h, poly, r, g, b, a) {
  for (let y = 0; y < h; y++) {
    const xs = [];
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[(i + 1) % poly.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y))
        xs.push(x1 + (y - y1) * (x2 - x1) / (y2 - y1));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const x0 = Math.max(0, Math.ceil(xs[i]));
      const x1 = Math.min(w - 1, Math.floor(xs[i + 1]));
      for (let x = x0; x <= x1; x++) {
        const idx = (y * w + x) * 4;
        buf[idx] = r; buf[idx+1] = g; buf[idx+2] = b; buf[idx+3] = a;
      }
    }
  }
}

/** Separable box blur (single H+V pass) on a Uint8Array RGBA buffer. */
function boxBlur(src, w, h, r) {
  r = Math.max(1, r | 0);
  const tmp = new Uint8Array(src.length);
  const dst = new Uint8Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let R=0,G=0,B=0,A=0,n=0;
      for (let dx = -r; dx <= r; dx++) {
        const nx = Math.max(0, Math.min(w-1, x+dx));
        const i = (y*w+nx)*4;
        R+=src[i]; G+=src[i+1]; B+=src[i+2]; A+=src[i+3]; n++;
      }
      const i=(y*w+x)*4;
      tmp[i]=R/n|0; tmp[i+1]=G/n|0; tmp[i+2]=B/n|0; tmp[i+3]=A/n|0;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let R=0,G=0,B=0,A=0,n=0;
      for (let dy = -r; dy <= r; dy++) {
        const ny = Math.max(0, Math.min(h-1, y+dy));
        const i = (ny*w+x)*4;
        R+=tmp[i]; G+=tmp[i+1]; B+=tmp[i+2]; A+=tmp[i+3]; n++;
      }
      const i=(y*w+x)*4;
      dst[i]=R/n|0; dst[i+1]=G/n|0; dst[i+2]=B/n|0; dst[i+3]=A/n|0;
    }
  }
  return dst;
}

/** Alpha-composite src over dst in-place. */
function composite(dst, src, count) {
  for (let i = 0; i < count * 4; i += 4) {
    const sa = src[i+3]/255, da = dst[i+3]/255;
    const oa = sa + da*(1-sa);
    if (oa > 0) {
      dst[i]   = clamp(((src[i]  *sa + dst[i]  *da*(1-sa))/oa)|0);
      dst[i+1] = clamp(((src[i+1]*sa + dst[i+1]*da*(1-sa))/oa)|0);
      dst[i+2] = clamp(((src[i+2]*sa + dst[i+2]*da*(1-sa))/oa)|0);
      dst[i+3] = clamp((oa*255)|0);
    }
  }
}

/** Downsample by integer factor using box filter. */
function downsample(src, sw, sh, factor) {
  const dw = (sw/factor)|0, dh = (sh/factor)|0;
  const dst = new Uint8Array(dw*dh*4);
  const n = factor*factor;
  for (let dy = 0; dy < dh; dy++) {
    for (let dx = 0; dx < dw; dx++) {
      let R=0,G=0,B=0,A=0;
      for (let fy = 0; fy < factor; fy++)
        for (let fx = 0; fx < factor; fx++) {
          const i = ((dy*factor+fy)*sw + (dx*factor+fx))*4;
          R+=src[i]; G+=src[i+1]; B+=src[i+2]; A+=src[i+3];
        }
      const i=(dy*dw+dx)*4;
      dst[i]=R/n|0; dst[i+1]=G/n|0; dst[i+2]=B/n|0; dst[i+3]=A/n|0;
    }
  }
  return { pixels: dst, w: dw, h: dh };
}

// ── Lightning bolt polygon (7 points) ──────────────────────────────────────
// Normalized [0,1] fractions of the canvas size S.
function getBolt(S) {
  return [
    [S*0.62, S*0.04],  // top-right
    [S*0.34, S*0.04],  // top-left
    [S*0.14, S*0.52],  // left tip
    [S*0.46, S*0.45],  // inner notch upper
    [S*0.27, S*0.96],  // bottom tip
    [S*0.67, S*0.48],  // right tip
    [S*0.52, S*0.56],  // inner notch lower
  ];
}

// ── Icon renderer ──────────────────────────────────────────────────────────
function generateIcon(targetSize) {
  const SCALE = 4;
  const S = targetSize * SCALE;
  const bolt = getBolt(S);
  const px = S * S;

  // Pure black, fully opaque background
  const base = new Uint8Array(px * 4);
  for (let i = 3; i < base.length; i += 4) base[i] = 255;

  const addGlow = (R, G, B, alpha, blurRadius) => {
    const layer = new Uint8Array(px * 4);
    fillPolygon(layer, S, S, bolt, R, G, B, alpha);
    composite(base, boxBlur(layer, S, S, blurRadius), px);
  };

  // Blue outer glow
  addGlow(79, 195, 247, 80, Math.round(S * 0.10));
  // Blue wide glow
  addGlow(79, 195, 247, 110, Math.round(S * 0.055));
  // Blue tight halo
  addGlow(79, 195, 247, 175, Math.round(S * 0.024));

  // Sharp blue bolt on top
  const sharp = new Uint8Array(px * 4);
  fillPolygon(sharp, S, S, bolt, 79, 195, 247, 255);
  composite(base, sharp, px);

  const { pixels, w, h } = downsample(base, S, S, SCALE);
  return encodePNG(w, h, pixels);
}

// ── Main ───────────────────────────────────────────────────────────────────
const outDir = path.join(__dirname, 'icons');
fs.mkdirSync(outDir, { recursive: true });

for (const size of [16, 48, 128]) {
  process.stdout.write(`Rendering icon${size}.png … `);
  const png  = generateIcon(size);
  const dest = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(dest, png);
  console.log(`done (${png.length} bytes)`);
}
console.log('All icons written to ./icons/');
