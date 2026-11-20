/**
 * Pure Node.js 22 RGBA32 PNG Encoder, Pixel Art Canvas Primitives & Phaser 3 JSON Hash Atlas Packer
 * Enforces Constitution v2.0.0 Principle V & Q1-A:
 *   - Crisp nearest-neighbor RGBA32 transparent PNGs (zero native C++ dependencies)
 *   - Mandatory padding: 2px on all sprite atlases, extrude: 1px on all tilesets
 *   - POT sheet dimensions <= 2048x2048, allowRotation: false
 *   - Deterministic SHA-256 checksum & sizeBytes reporting (data-model.md: AssetManifest.pixelStandard, AssetEntry.sha256, AssetEntry.sizeBytes)
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(combined), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

export function hexToRgba(hex, alpha = 255) {
  if (!hex || hex === 'transparent') return [0, 0, 0, 0];
  const clean = hex.replace('#', '');
  if (clean.length === 8) {
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
      parseInt(clean.slice(6, 8), 16),
    ];
  }
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
    alpha,
  ];
}

export function nextPot(v) {
  let p = 1;
  while (p < v) p <<= 1;
  return p;
}

export class PixelBuffer {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
  }

  setPixel(x, y, hex, alpha = 255) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) return;
    const [r, g, b, a] = Array.isArray(hex) ? hex : hexToRgba(hex, alpha);
    if (a === 0) return;
    const idx = (iy * this.width + ix) * 4;
    if (a === 255 || this.data[idx + 3] === 0) {
      this.data[idx] = r;
      this.data[idx + 1] = g;
      this.data[idx + 2] = b;
      this.data[idx + 3] = a;
    } else {
      const sa = a / 255;
      const da = this.data[idx + 3] / 255;
      const outA = sa + da * (1 - sa);
      this.data[idx] = Math.round((r * sa + this.data[idx] * da * (1 - sa)) / outA);
      this.data[idx + 1] = Math.round((g * sa + this.data[idx + 1] * da * (1 - sa)) / outA);
      this.data[idx + 2] = Math.round((b * sa + this.data[idx + 2] * da * (1 - sa)) / outA);
      this.data[idx + 3] = Math.round(outA * 255);
    }
  }

  getPixel(x, y) {
    const ix = Math.max(0, Math.min(this.width - 1, Math.round(x)));
    const iy = Math.max(0, Math.min(this.height - 1, Math.round(y)));
    const idx = (iy * this.width + ix) * 4;
    return [this.data[idx], this.data[idx + 1], this.data[idx + 2], this.data[idx + 3]];
  }

  rect(x, y, w, h, hex, alpha = 255) {
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    const w0 = Math.round(w);
    const h0 = Math.round(h);
    for (let dy = 0; dy < h0; dy++) {
      for (let dx = 0; dx < w0; dx++) {
        this.setPixel(x0 + dx, y0 + dy, hex, alpha);
      }
    }
  }

  outlineRect(x, y, w, h, fillHex, outlineHex = '#14111b', alpha = 255) {
    this.rect(x, y, w, h, outlineHex, alpha);
    if (w > 2 && h > 2) {
      this.rect(x + 1, y + 1, w - 2, h - 2, fillHex, alpha);
    }
  }

  circle(cx, cy, r, hex, alpha = 255) {
    const r2 = r * r;
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        if (dx * dx + dy * dy <= r2) {
          this.setPixel(cx + dx, cy + dy, hex, alpha);
        }
      }
    }
  }

  ring(cx, cy, rOuter, rInner, hex, alpha = 255) {
    const ro2 = rOuter * rOuter;
    const ri2 = rInner * rInner;
    for (let dy = -Math.ceil(rOuter); dy <= Math.ceil(rOuter); dy++) {
      for (let dx = -Math.ceil(rOuter); dx <= Math.ceil(rOuter); dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 <= ro2 && d2 >= ri2) {
          this.setPixel(cx + dx, cy + dy, hex, alpha);
        }
      }
    }
  }

  ellipse(cx, cy, rx, ry, hex, alpha = 255) {
    for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++) {
      for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx++) {
        const v = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
        if (v <= 1.0) this.setPixel(cx + dx, cy + dy, hex, alpha);
      }
    }
  }

  line(x0, y0, x1, y1, hex, alpha = 255, thickness = 1) {
    let ax = Math.round(x0), ay = Math.round(y0);
    const bx = Math.round(x1), by = Math.round(y1);
    const dx = Math.abs(bx - ax), dy = Math.abs(by - ay);
    const sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1;
    let err = dx - dy;
    while (true) {
      if (thickness <= 1) this.setPixel(ax, ay, hex, alpha);
      else this.rect(ax - Math.floor(thickness / 2), ay - Math.floor(thickness / 2), thickness, thickness, hex, alpha);
      if (ax === bx && ay === by) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; ax += sx; }
      if (e2 < dx) { err += dx; ay += sy; }
    }
  }

  blit(src, dstX, dstY) {
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const p = src.getPixel(x, y);
        if (p[3] > 0) this.setPixel(dstX + x, dstY + y, p);
      }
    }
  }

  blitExtruded(src, dstX, dstY, extrudePx = 1) {
    // Copy interior
    this.blit(src, dstX, dstY);
    // Extrude 1px outer borders to prevent WebGL seam bleeding!
    for (let e = 1; e <= extrudePx; e++) {
      for (let x = 0; x < src.width; x++) {
        this.setPixel(dstX + x, dstY - e, src.getPixel(x, 0));
        this.setPixel(dstX + x, dstY + src.height - 1 + e, src.getPixel(x, src.height - 1));
      }
      for (let y = 0; y < src.height; y++) {
        this.setPixel(dstX - e, dstY + y, src.getPixel(0, y));
        this.setPixel(dstX + src.width - 1 + e, dstY + y, src.getPixel(src.width - 1, y));
      }
      // 4 corners
      this.setPixel(dstX - e, dstY - e, src.getPixel(0, 0));
      this.setPixel(dstX + src.width - 1 + e, dstY - e, src.getPixel(src.width - 1, 0));
      this.setPixel(dstX - e, dstY + src.height - 1 + e, src.getPixel(0, src.height - 1));
      this.setPixel(dstX + src.width - 1 + e, dstY + src.height - 1 + e, src.getPixel(src.width - 1, src.height - 1));
    }
  }

  flipX() {
    const out = new PixelBuffer(this.width, this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const p = this.getPixel(x, y);
        if (p[3] > 0) out.setPixel(this.width - 1 - x, y, p);
      }
    }
    return out;
  }

  toPngBuffer() {
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.width, 0);
    ihdr.writeUInt32BE(this.height, 4);
    ihdr[8] = 8; // bit depth 8
    ihdr[9] = 6; // RGBA
    ihdr[10] = 0; // deflate
    ihdr[11] = 0; // filter
    ihdr[12] = 0; // no interlace

    const stride = this.width * 4;
    const raw = Buffer.alloc((stride + 1) * this.height);
    for (let y = 0; y < this.height; y++) {
      const rowStart = y * (stride + 1);
      raw[rowStart] = 0; // filter type None
      raw.set(this.data.subarray(y * stride, (y + 1) * stride), rowStart + 1);
    }
    const compressed = zlib.deflateSync(raw, { level: 9 });
    return Buffer.concat([
      sig,
      pngChunk('IHDR', ihdr),
      pngChunk('IDAT', compressed),
      pngChunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

export function sha256Buffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export function writeFileWithMeta(absPath, contentBuf) {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, contentBuf);
  return {
    sha256: sha256Buffer(contentBuf),
    sizeBytes: contentBuf.length,
  };
}

/**
 * Packs named PixelBuffer frames into a POT <= 2048x2048 Phaser 3 JSON Hash Atlas
 * with mandatory padding: 2px and optional extrude: 1px.
 */
export function packPhaserAtlas({
  frames, // Array<{ name: string, buf: PixelBuffer, pivot?: { x: number, y: number } }>
  imageFileName,
  paddingPx = 2,
  extrudePx = 0,
  maxDim = 2048,
}) {
  // Sort by height descending for efficient shelf packing
  const sorted = [...frames].sort((a, b) => b.buf.height - a.buf.height || b.buf.width - a.buf.width);
  const gap = paddingPx + extrudePx;

  // Estimate target width (POT <= maxDim)
  const totalArea = sorted.reduce((acc, f) => acc + (f.buf.width + gap * 2) * (f.buf.height + gap * 2), 0);
  let sheetW = Math.min(maxDim, Math.max(64, nextPot(Math.ceil(Math.sqrt(totalArea * 1.2)))));

  let placements = [];
  let sheetH = 0;

  for (let attempt = 0; attempt < 5; attempt++) {
    placements = [];
    let cursorX = gap;
    let cursorY = gap;
    let rowH = 0;
    let overflow = false;

    for (const item of sorted) {
      const needW = item.buf.width + gap * 2;
      const needH = item.buf.height + gap * 2;
      if (cursorX + item.buf.width + gap > sheetW) {
        cursorX = gap;
        cursorY += rowH + gap;
        rowH = 0;
      }
      if (cursorX + item.buf.width + gap > sheetW) {
        overflow = true;
        break;
      }
      placements.push({ item, x: cursorX, y: cursorY });
      cursorX += item.buf.width + gap * 2;
      if (item.buf.height + gap > rowH) rowH = item.buf.height + gap;
    }

    sheetH = nextPot(cursorY + rowH + gap);
    if (!overflow && sheetH <= maxDim && sheetW <= maxDim) break;
    sheetW = Math.min(maxDim, sheetW * 2);
  }

  if (sheetW > maxDim || sheetH > maxDim) {
    throw new Error(`Atlas ${imageFileName} exceeded maxDim ${maxDim}x${maxDim} (${sheetW}x${sheetH})`);
  }

  const sheet = new PixelBuffer(sheetW, sheetH);
  const jsonFrames = {};

  for (const { item, x, y } of placements) {
    if (extrudePx > 0) sheet.blitExtruded(item.buf, x, y, extrudePx);
    else sheet.blit(item.buf, x, y);

    jsonFrames[item.name] = {
      frame: { x, y, w: item.buf.width, h: item.buf.height },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: item.buf.width, h: item.buf.height },
      sourceSize: { w: item.buf.width, h: item.buf.height },
      pivot: item.pivot || { x: 0.5, y: 0.875 },
    };
  }

  const pngBuf = sheet.toPngBuffer();
  const atlasJson = {
    frames: jsonFrames,
    meta: {
      app: 'Eldoria Offline Pixel Atlas Packer',
      version: '1.0.0',
      image: imageFileName,
      format: 'RGBA8888',
      size: { w: sheetW, h: sheetH },
      scale: '1',
      paddingPx,
      extrudePx,
    },
  };

  return {
    pngBuf,
    jsonBuf: Buffer.from(JSON.stringify(atlasJson, null, 2), 'utf8'),
    width: sheetW,
    height: sheetH,
    frameCount: placements.length,
  };
}
