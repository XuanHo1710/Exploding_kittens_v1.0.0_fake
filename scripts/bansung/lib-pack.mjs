/**
 * Zero-dependency Node 22 ESM asset-packing & normalization library for `ban_sung`.
 *
 * Provides:
 * - Pure-zlib PNG decode/encode (RGBA, RGB, Indexed PLTE+tRNS, Grayscale, Adam7)
 * - Pixel image ops (crop, nearest-neighbor resize/scale, flip, blit, slice)
 * - Alpha hardening, optional dark-edge strip, #181425 1px 4-connected outline
 * - 48-color Soul-Knight/Miragine RGB555 LUT quantizer (`BANSUNG_PALETTE_48`)
 * - Feet-anchor / center / grip sprite-strip packer
 * - Pure-JS RIFF/WAVE PCM reader/writer (8/16/24/32-bit PCM & IEEE float32)
 * - DC removal, silence trim, edge fades, RMS + -1.0 dBFS peak limiter/normalizer
 * - HTTPS `fetchBuffer` w/ timeout, retries, byte cap, and magic-byte validation
 * - Zip-slip-safe ZIP extractor (pure-Node Stored/Deflate + platform fallback)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Constants & Canonical 48-Color Palette (d14, d15, d16)
// ---------------------------------------------------------------------------

export const BANSUNG_PALETTE_RAMPS = Object.freeze({
  R0_MONO:    ['#181425', '#262b44', '#3a4466', '#5a6988', '#8b9bb4', '#e6eef8'],
  R1_SAND:    ['#733e39', '#9e5b47', '#c9885b', '#e8b878', '#f5d89e', '#fff0c2'],
  R2_EARTH:   ['#2e1d1b', '#4d312c', '#6e4b3f', '#916b57', '#b39078', '#d6baa2'],
  R3_CRIMSON: ['#4c1424', '#8a1c31', '#c72936', '#e43b44', '#ff7a3d', '#fee761'],
  R4_GREEN:   ['#193c3e', '#265c42', '#3e8948', '#63c74d', '#a7f070', '#e0ff9e'],
  R5_ENERGY:  ['#143464', '#124e89', '#0095e9', '#2ce8f5', '#9cf9ff', '#ffffff'],
  R6_ARCANE:  ['#381d4a', '#622c73', '#96419c', '#cf61b8', '#ff9ee2', '#ffdbf5'],
  R7_COPPER:  ['#45242e', '#783e3b', '#ab5a47', '#d9845c', '#f0ae81', '#ffd8b8'],
});

export const BANSUNG_PALETTE_48 = Object.freeze(
  Object.values(BANSUNG_PALETTE_RAMPS).flat(),
);

export function hexToRgba(hex, alpha = 255) {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  if (clean.length !== 6 && clean.length !== 8) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const a = clean.length === 8 ? parseInt(clean.slice(6, 8), 16) : alpha;
  return [r, g, b, a];
}

export const BANSUNG_PALETTE_RGBA = Object.freeze(
  BANSUNG_PALETTE_48.map((hex) => Object.freeze(hexToRgba(hex, 255))),
);

export const NORM_CONSTANTS = Object.freeze({
  ALPHA_CUTOFF: 128,
  OUTLINE_HEX: '#181425',
  OUTLINE_RGBA: Object.freeze([24, 20, 37, 255]),
  FOOT_PAD_BOTTOM: 2,
  SAFE_PRE_SCALES: Object.freeze([0.5, 1, 2]),
  NATIVE_FACING: 'right',
  TIERS: Object.freeze([32, 48, 96]),
});

export const WAV_CONSTANTS = Object.freeze({
  DEFAULT_SAMPLE_RATE: 44100,
  PEAK_CEILING_DB: -1.0,
  PEAK_CEILING_LINEAR: Math.pow(10, -1.0 / 20), // 0.891250938...
  SFX_TARGET_RMS_DB: -16.0,
  BGM_TARGET_RMS_DB: -18.0,
  HEAD_TRIM_THRESHOLD: 0.00398, // -48 dBFS
  TAIL_TRIM_THRESHOLD: 0.00200, // -54 dBFS
  PRE_ROLL_MS: 2,
  TAIL_PAD_MS: 15,
  FADE_IN_MS: 3,
  FADE_OUT_MS: 12,
  LOOP_CROSSFADE_MS: 15,
});

// ---------------------------------------------------------------------------
// CRC-32 & Pure-Node Zlib PNG Codec
// ---------------------------------------------------------------------------

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC32_TABLE = (() => {
  const tbl = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    tbl[n] = c >>> 0;
  }
  return tbl;
})();

export function crc32(buf, initial = 0) {
  let c = (initial ^ 0xffffffff) >>> 0;
  for (let i = 0; i < buf.length; i++) {
    c = CRC32_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilterScanlines(raw, width, height, channels, bitDepth) {
  const bitsPerPixel = channels * bitDepth;
  const rowBytes = Math.ceil((width * bitsPerPixel) / 8);
  const bpp = Math.max(1, Math.ceil(bitsPerPixel / 8));
  const expected = height * (1 + rowBytes);
  if (raw.length < expected) {
    throw new Error(`PNG IDAT truncated: got ${raw.length} bytes, expected >= ${expected}`);
  }
  const out = new Uint8Array(height * rowBytes);
  for (let y = 0; y < height; y++) {
    const srcOff = y * (1 + rowBytes);
    const dstOff = y * rowBytes;
    const filter = raw[srcOff];
    const prevOff = (y - 1) * rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      const filt = raw[srcOff + 1 + x];
      const a = x >= bpp ? out[dstOff + x - bpp] : 0;
      const b = y > 0 ? out[prevOff + x] : 0;
      const c = (y > 0 && x >= bpp) ? out[prevOff + x - bpp] : 0;
      let val;
      if (filter === 0) val = filt;
      else if (filter === 1) val = filt + a;
      else if (filter === 2) val = filt + b;
      else if (filter === 3) val = filt + ((a + b) >> 1);
      else if (filter === 4) val = filt + paethPredictor(a, b, c);
      else throw new Error(`Unsupported PNG scanline filter type: ${filter}`);
      out[dstOff + x] = val & 0xff;
    }
  }
  return { out, rowBytes };
}

function samplesToRgba(unfiltered, rowBytes, width, height, colorType, bitDepth, plte, trns) {
  const rgba = new Uint8Array(width * height * 4);

  const readSubByte = (rowBase, x, depth) => {
    const perByte = 8 / depth;
    const byteIdx = rowBase + Math.floor(x / perByte);
    const shift = (perByte - 1 - (x % perByte)) * depth;
    const mask = (1 << depth) - 1;
    return (unfiltered[byteIdx] >> shift) & mask;
  };

  if (colorType === 6 && bitDepth === 8) {
    for (let y = 0; y < height; y++) {
      const srcBase = y * rowBytes;
      const dstBase = y * width * 4;
      rgba.set(unfiltered.subarray(srcBase, srcBase + width * 4), dstBase);
    }
    return rgba;
  }

  for (let y = 0; y < height; y++) {
    const rowBase = y * rowBytes;
    for (let x = 0; x < width; x++) {
      const dst = (y * width + x) * 4;
      if (colorType === 6) {
        // 16-bit RGBA
        const s = rowBase + x * 8;
        rgba[dst] = unfiltered[s];
        rgba[dst + 1] = unfiltered[s + 2];
        rgba[dst + 2] = unfiltered[s + 4];
        rgba[dst + 3] = unfiltered[s + 6];
      } else if (colorType === 2) {
        if (bitDepth === 8) {
          const s = rowBase + x * 3;
          const r = unfiltered[s], g = unfiltered[s + 1], b = unfiltered[s + 2];
          let a = 255;
          if (trns && trns.length >= 6) {
            const tr = trns.readUInt16BE(0), tg = trns.readUInt16BE(2), tb = trns.readUInt16BE(4);
            if (r === tr && g === tg && b === tb) a = 0;
          }
          rgba[dst] = r; rgba[dst + 1] = g; rgba[dst + 2] = b; rgba[dst + 3] = a;
        } else {
          const s = rowBase + x * 6;
          const r16 = (unfiltered[s] << 8) | unfiltered[s + 1];
          const g16 = (unfiltered[s + 2] << 8) | unfiltered[s + 3];
          const b16 = (unfiltered[s + 4] << 8) | unfiltered[s + 5];
          let a = 255;
          if (trns && trns.length >= 6) {
            if (r16 === trns.readUInt16BE(0) && g16 === trns.readUInt16BE(2) && b16 === trns.readUInt16BE(4)) a = 0;
          }
          rgba[dst] = r16 >> 8; rgba[dst + 1] = g16 >> 8; rgba[dst + 2] = b16 >> 8; rgba[dst + 3] = a;
        }
      } else if (colorType === 3) {
        if (!plte) throw new Error('PNG colorType 3 missing PLTE chunk');
        const idx = bitDepth === 8 ? unfiltered[rowBase + x] : readSubByte(rowBase, x, bitDepth);
        const p = idx * 3;
        if (p + 2 >= plte.length) throw new Error(`PNG PLTE index out of range: ${idx}`);
        rgba[dst] = plte[p];
        rgba[dst + 1] = plte[p + 1];
        rgba[dst + 2] = plte[p + 2];
        rgba[dst + 3] = (trns && idx < trns.length) ? trns[idx] : 255;
      } else if (colorType === 0) {
        let rawVal;
        let gray;
        if (bitDepth === 16) {
          rawVal = (unfiltered[rowBase + x * 2] << 8) | unfiltered[rowBase + x * 2 + 1];
          gray = rawVal >> 8;
        } else if (bitDepth === 8) {
          rawVal = unfiltered[rowBase + x];
          gray = rawVal;
        } else {
          rawVal = readSubByte(rowBase, x, bitDepth);
          gray = Math.round((rawVal * 255) / ((1 << bitDepth) - 1));
        }
        let a = 255;
        if (trns && trns.length >= 2 && rawVal === trns.readUInt16BE(0)) a = 0;
        rgba[dst] = gray; rgba[dst + 1] = gray; rgba[dst + 2] = gray; rgba[dst + 3] = a;
      } else if (colorType === 4) {
        if (bitDepth === 8) {
          const s = rowBase + x * 2;
          const gray = unfiltered[s];
          rgba[dst] = gray; rgba[dst + 1] = gray; rgba[dst + 2] = gray; rgba[dst + 3] = unfiltered[s + 1];
        } else {
          const s = rowBase + x * 4;
          const gray = unfiltered[s];
          rgba[dst] = gray; rgba[dst + 1] = gray; rgba[dst + 2] = gray; rgba[dst + 3] = unfiltered[s + 2];
        }
      } else {
        throw new Error(`Unsupported PNG colorType=${colorType} bitDepth=${bitDepth}`);
      }
    }
  }
  return rgba;
}

const ADAM7_X0 = [0, 4, 0, 2, 0, 1, 0];
const ADAM7_DX = [8, 8, 4, 4, 2, 2, 1];
const ADAM7_Y0 = [0, 0, 4, 0, 2, 0, 1];
const ADAM7_DY = [8, 8, 8, 4, 4, 2, 2];

const CHANNELS_BY_COLOR_TYPE = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export function inspectPngHeader(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buf.length < 33 || !buf.subarray(0, 8).equals(PNG_SIG)) {
    throw new Error('Invalid PNG signature');
  }
  const ihdrLen = buf.readUInt32BE(8);
  const ihdrType = buf.subarray(12, 16).toString('ascii');
  if (ihdrType !== 'IHDR' || ihdrLen < 13) {
    throw new Error(`Invalid PNG IHDR chunk: ${ihdrType} (${ihdrLen})`);
  }
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    bitDepth: buf[24],
    colorType: buf[25],
    compression: buf[26],
    filterMethod: buf[27],
    interlace: buf[28],
  };
}

export function decodePng(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const header = inspectPngHeader(buf);
  const { width, height, bitDepth, colorType, compression, filterMethod, interlace } = header;
  if (width <= 0 || height <= 0 || width > 16384 || height > 16384) {
    throw new Error(`PNG dimensions out of range: ${width}x${height}`);
  }
  if (compression !== 0 || filterMethod !== 0) {
    throw new Error(`Unsupported PNG compression/filter: ${compression}/${filterMethod}`);
  }
  const channels = CHANNELS_BY_COLOR_TYPE[colorType];
  if (!channels) throw new Error(`Unsupported PNG colorType: ${colorType}`);

  let offset = 8;
  let plte = null;
  let trns = null;
  const idatChunks = [];
  let sawIend = false;

  while (offset + 12 <= buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const dataEnd = dataStart + len;
    if (dataEnd + 4 > buf.length) {
      throw new Error(`Truncated PNG chunk ${type} at offset ${offset}`);
    }
    const payload = buf.subarray(dataStart, dataEnd);
    if (type === 'PLTE') plte = payload;
    else if (type === 'tRNS') trns = payload;
    else if (type === 'IDAT') idatChunks.push(payload);
    else if (type === 'IEND') { sawIend = true; break; }
    offset = dataEnd + 4;
  }

  if (!sawIend && idatChunks.length === 0) {
    throw new Error('PNG missing IDAT/IEND chunks');
  }

  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  let data;

  if (interlace === 0) {
    const { out, rowBytes } = unfilterScanlines(inflated, width, height, channels, bitDepth);
    data = samplesToRgba(out, rowBytes, width, height, colorType, bitDepth, plte, trns);
  } else if (interlace === 1) {
    data = new Uint8Array(width * height * 4);
    let pos = 0;
    const bitsPerPixel = channels * bitDepth;
    for (let pass = 0; pass < 7; pass++) {
      const pw = width > ADAM7_X0[pass] ? Math.ceil((width - ADAM7_X0[pass]) / ADAM7_DX[pass]) : 0;
      const ph = height > ADAM7_Y0[pass] ? Math.ceil((height - ADAM7_Y0[pass]) / ADAM7_DY[pass]) : 0;
      if (pw === 0 || ph === 0) continue;
      const passRowBytes = Math.ceil((pw * bitsPerPixel) / 8);
      const passBytes = ph * (1 + passRowBytes);
      const slice = inflated.subarray(pos, pos + passBytes);
      pos += passBytes;
      const { out } = unfilterScanlines(slice, pw, ph, channels, bitDepth);
      const passRgba = samplesToRgba(out, passRowBytes, pw, ph, colorType, bitDepth, plte, trns);
      for (let py = 0; py < ph; py++) {
        const dy = ADAM7_Y0[pass] + py * ADAM7_DY[pass];
        for (let px = 0; px < pw; px++) {
          const dx = ADAM7_X0[pass] + px * ADAM7_DX[pass];
          const srcIdx = (py * pw + px) * 4;
          const dstIdx = (dy * width + dx) * 4;
          data[dstIdx] = passRgba[srcIdx];
          data[dstIdx + 1] = passRgba[srcIdx + 1];
          data[dstIdx + 2] = passRgba[srcIdx + 2];
          data[dstIdx + 3] = passRgba[srcIdx + 3];
        }
      }
    }
  } else {
    throw new Error(`Unsupported PNG interlace method: ${interlace}`);
  }

  return { width, height, data, bitDepth, colorType };
}

function makePngChunk(type, payload) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(payload.length, 0);
  const crcInput = Buffer.concat([typeBuf, payload]);
  const crcBuf = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, crcInput, crcBuf]);
}

export function encodePng(widthOrImg, heightArg, rgbaArg) {
  let width, height, rgba;
  if (typeof widthOrImg === 'object' && widthOrImg !== null && 'width' in widthOrImg) {
    width = widthOrImg.width;
    height = widthOrImg.height;
    rgba = widthOrImg.data;
  } else {
    width = widthOrImg;
    height = heightArg;
    rgba = rgbaArg;
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`Invalid encodePng dimensions: ${width}x${height}`);
  }
  const expectedBytes = width * height * 4;
  if (!rgba || rgba.length < expectedBytes) {
    throw new Error(`RGBA buffer too small: got ${rgba?.length ?? 0}, need ${expectedBytes}`);
  }

  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bitDepth
  ihdr[9] = 6; // colorType RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const rowBytes = width * 4;
  const raw = Buffer.allocUnsafe(height * (1 + rowBytes));
  const srcView = rgba instanceof Uint8Array ? rgba : Uint8Array.from(rgba);
  for (let y = 0; y < height; y++) {
    const dst = y * (1 + rowBytes);
    raw[dst] = 0; // Filter None
    raw.set(srcView.subarray(y * rowBytes, (y + 1) * rowBytes), dst + 1);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    PNG_SIG,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', compressed),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export async function readPngFile(filePath) {
  const buf = await fs.readFile(filePath);
  return decodePng(buf);
}

export async function writePngFile(filePath, img) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, encodePng(img));
}

// ---------------------------------------------------------------------------
// Pixel Image Manipulation & Normalization (d14, d15)
// ---------------------------------------------------------------------------

export function createImage(width, height, fillRgba = [0, 0, 0, 0]) {
  const data = new Uint8Array(width * height * 4);
  const [r, g, b, a] = fillRgba;
  if (r || g || b || a) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return { width, height, data };
}

export function cloneImage(img) {
  return { width: img.width, height: img.height, data: new Uint8Array(img.data) };
}

export function cropImage(img, x, y, w, h) {
  const out = createImage(w, h);
  for (let dy = 0; dy < h; dy++) {
    const sy = y + dy;
    if (sy < 0 || sy >= img.height) continue;
    for (let dx = 0; dx < w; dx++) {
      const sx = x + dx;
      if (sx < 0 || sx >= img.width) continue;
      const si = (sy * img.width + sx) * 4;
      const di = (dy * w + dx) * 4;
      out.data[di] = img.data[si];
      out.data[di + 1] = img.data[si + 1];
      out.data[di + 2] = img.data[si + 2];
      out.data[di + 3] = img.data[si + 3];
    }
  }
  return out;
}

export function resizeImage(img, dstW, dstH) {
  const w = Math.max(1, Math.round(dstW));
  const h = Math.max(1, Math.round(dstH));
  if (w === img.width && h === img.height) return cloneImage(img);
  const out = createImage(w, h);
  for (let dy = 0; dy < h; dy++) {
    const sy = Math.min(img.height - 1, Math.floor((dy * img.height) / h));
    for (let dx = 0; dx < w; dx++) {
      const sx = Math.min(img.width - 1, Math.floor((dx * img.width) / w));
      const si = (sy * img.width + sx) * 4;
      const di = (dy * w + dx) * 4;
      out.data[di] = img.data[si];
      out.data[di + 1] = img.data[si + 1];
      out.data[di + 2] = img.data[si + 2];
      out.data[di + 3] = img.data[si + 3];
    }
  }
  return out;
}

export function scaleImage(img, scale) {
  if (scale === 1) return cloneImage(img);
  return resizeImage(img, Math.max(1, Math.round(img.width * scale)), Math.max(1, Math.round(img.height * scale)));
}

export function flipImageX(img) {
  const out = createImage(img.width, img.height);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const si = (y * img.width + (img.width - 1 - x)) * 4;
      const di = (y * img.width + x) * 4;
      out.data[di] = img.data[si];
      out.data[di + 1] = img.data[si + 1];
      out.data[di + 2] = img.data[si + 2];
      out.data[di + 3] = img.data[si + 3];
    }
  }
  return out;
}

export function flipImageY(img) {
  const out = createImage(img.width, img.height);
  const rowBytes = img.width * 4;
  for (let y = 0; y < img.height; y++) {
    const srcRow = (img.height - 1 - y) * rowBytes;
    out.data.set(img.data.subarray(srcRow, srcRow + rowBytes), y * rowBytes);
  }
  return out;
}

export function blitImage(dst, src, dstX = 0, dstY = 0, opts = {}) {
  const {
    srcX = 0,
    srcY = 0,
    srcW = src.width,
    srcH = src.height,
    alphaBlend = false,
  } = opts;
  for (let y = 0; y < srcH; y++) {
    const sy = srcY + y;
    const dy = dstY + y;
    if (sy < 0 || sy >= src.height || dy < 0 || dy >= dst.height) continue;
    for (let x = 0; x < srcW; x++) {
      const sx = srcX + x;
      const dx = dstX + x;
      if (sx < 0 || sx >= src.width || dx < 0 || dx >= dst.width) continue;
      const si = (sy * src.width + sx) * 4;
      const sa = src.data[si + 3];
      if (sa === 0) continue;
      const di = (dy * dst.width + dx) * 4;
      if (!alphaBlend || sa === 255 || dst.data[di + 3] === 0) {
        dst.data[di] = src.data[si];
        dst.data[di + 1] = src.data[si + 1];
        dst.data[di + 2] = src.data[si + 2];
        dst.data[di + 3] = sa;
      } else {
        const inv = 255 - sa;
        const da = dst.data[di + 3];
        const outA = sa + Math.round((da * inv) / 255);
        if (outA > 0) {
          dst.data[di] = Math.round((src.data[si] * sa + dst.data[di] * da * (inv / 255)) / outA);
          dst.data[di + 1] = Math.round((src.data[si + 1] * sa + dst.data[di + 1] * da * (inv / 255)) / outA);
          dst.data[di + 2] = Math.round((src.data[si + 2] * sa + dst.data[di + 2] * da * (inv / 255)) / outA);
          dst.data[di + 3] = outA;
        }
      }
    }
  }
  return dst;
}

export function sliceSpriteSheet(img, cellW, cellH, opts = {}) {
  const cols = opts.cols ?? Math.floor(img.width / cellW);
  const rows = opts.rows ?? Math.floor(img.height / cellH);
  const maxCount = opts.count ?? (cols * rows);
  const frames = [];
  for (let r = 0; r < rows && frames.length < maxCount; r++) {
    for (let c = 0; c < cols && frames.length < maxCount; c++) {
      frames.push(cropImage(img, c * cellW, r * cellH, cellW, cellH));
    }
  }
  return frames;
}

export function hardenAlpha(img, cutoff = NORM_CONSTANTS.ALPHA_CUTOFF) {
  const out = cloneImage(img);
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] < cutoff) {
      out.data[i] = 0;
      out.data[i + 1] = 0;
      out.data[i + 2] = 0;
      out.data[i + 3] = 0;
    } else {
      out.data[i + 3] = 255;
    }
  }
  return out;
}

export function getOpaqueBBox(img, alphaCutoff = NORM_CONSTANTS.ALPHA_CUTOFF) {
  let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const a = img.data[(y * img.width + x) * 4 + 3];
      if (a >= alphaCutoff) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, empty: true };
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    empty: false,
  };
}

export function computeFootCenterX(img, bbox, alphaCutoff = NORM_CONSTANTS.ALPHA_CUTOFF) {
  const box = bbox ?? getOpaqueBBox(img, alphaCutoff);
  if (box.empty) return Math.floor(img.width / 2);
  const startY = box.maxY - Math.floor((box.maxY - box.minY) * 0.25);
  let sumX = 0;
  let count = 0;
  for (let y = startY; y <= box.maxY; y++) {
    for (let x = box.minX; x <= box.maxX; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] >= alphaCutoff) {
        sumX += x;
        count++;
      }
    }
  }
  if (count === 0) return Math.round((box.minX + box.maxX) / 2);
  return Math.round(sumX / count);
}

export function stripDarkOutline(img, opts = {}) {
  const { lumaMax = 45, alphaCutoff = NORM_CONSTANTS.ALPHA_CUTOFF } = opts;
  const out = cloneImage(img);
  const { width, height, data } = img;
  const isTransparent = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return true;
    return data[(y * width + x) * 4 + 3] < alphaCutoff;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] < alphaCutoff) continue;
      const luma = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      if (luma >= lumaMax) continue;
      if (isTransparent(x - 1, y) || isTransparent(x + 1, y) || isTransparent(x, y - 1) || isTransparent(x, y + 1)) {
        out.data[idx] = 0;
        out.data[idx + 1] = 0;
        out.data[idx + 2] = 0;
        out.data[idx + 3] = 0;
      }
    }
  }
  return out;
}

export function applyOutline4Conn(img, outlineColor = NORM_CONSTANTS.OUTLINE_RGBA, alphaCutoff = NORM_CONSTANTS.ALPHA_CUTOFF) {
  const rgba = typeof outlineColor === 'string' ? hexToRgba(outlineColor, 255) : outlineColor;
  const out = cloneImage(img);
  const { width, height, data } = img;
  const isOpaque = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    return data[(y * width + x) * 4 + 3] >= alphaCutoff;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] >= alphaCutoff) continue;
      if (isOpaque(x - 1, y) || isOpaque(x + 1, y) || isOpaque(x, y - 1) || isOpaque(x, y + 1)) {
        out.data[idx] = rgba[0];
        out.data[idx + 1] = rgba[1];
        out.data[idx + 2] = rgba[2];
        out.data[idx + 3] = rgba[3] ?? 255;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 48-Color Master Palette RGB555 LUT Quantizer (d14 §4)
// ---------------------------------------------------------------------------

export function buildPaletteLut(palette = BANSUNG_PALETTE_RGBA, startIndex = 0) {
  const pal = palette.map((c) => (typeof c === 'string' ? hexToRgba(c, 255) : c));
  const lut = new Uint8Array(32768);
  for (let r5 = 0; r5 < 32; r5++) {
    const r = (r5 << 3) | (r5 >> 2);
    for (let g5 = 0; g5 < 32; g5++) {
      const g = (g5 << 3) | (g5 >> 2);
      for (let b5 = 0; b5 < 32; b5++) {
        const b = (b5 << 3) | (b5 >> 2);
        let bestIdx = startIndex;
        let bestDist = Infinity;
        for (let i = startIndex; i < pal.length; i++) {
          const [pr, pg, pb] = pal[i];
          const dr = r - pr;
          const dg = g - pg;
          const db = b - pb;
          const rm = (r + pr) >> 1;
          const dist = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = i;
          }
        }
        lut[(r5 << 10) | (g5 << 5) | b5] = bestIdx;
      }
    }
  }
  return lut;
}

let cachedDefaultLut = null;
export function getDefaultPaletteLut() {
  if (!cachedDefaultLut) {
    // Include index 0 (#181425) so dark ink/seams never quantize into brown #2e1d1b.
    cachedDefaultLut = buildPaletteLut(BANSUNG_PALETTE_RGBA, 0);
  }
  return cachedDefaultLut;
}

export function quantizeImageToPalette48(img, opts = {}) {
  const {
    lutStrength = 1.0,
    lut = getDefaultPaletteLut(),
    palette = BANSUNG_PALETTE_RGBA,
    alphaCutoff = NORM_CONSTANTS.ALPHA_CUTOFF,
    preserveOutline,
    preserveDarkOutline,
    outlineRgba = NORM_CONSTANTS.OUTLINE_RGBA,
  } = opts;
  const keepOutline = preserveOutline ?? preserveDarkOutline ?? true;
  if (lutStrength <= 0) return cloneImage(img);
  const strength = Math.min(1, Math.max(0, lutStrength));
  const out = cloneImage(img);
  const [or, og, ob] = typeof outlineRgba === 'string' ? hexToRgba(outlineRgba, 255) : outlineRgba;

  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] < alphaCutoff) continue;
    const r = out.data[i];
    const g = out.data[i + 1];
    const b = out.data[i + 2];
    if (keepOutline && r === or && g === og && b === ob) continue;
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const [pr, pg, pb] = palette[lut[key]];
    if (strength === 1) {
      out.data[i] = pr;
      out.data[i + 1] = pg;
      out.data[i + 2] = pb;
    } else {
      out.data[i] = Math.round(r + (pr - r) * strength);
      out.data[i + 1] = Math.round(g + (pg - g) * strength);
      out.data[i + 2] = Math.round(b + (pb - b) * strength);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Feet-Anchor Normalization & Sheet Packing (d14 §2, §6; d15 §3)
// ---------------------------------------------------------------------------

export function promoteTier(tier, contentW, contentH) {
  const candidates = [32, 48, 96];
  let idx = candidates.indexOf(tier);
  if (idx === -1) return tier;
  while (idx < candidates.length - 1) {
    const t = candidates[idx];
    if (contentW <= t - 2 && contentH <= t - 3) return t;
    idx++;
  }
  return candidates[idx];
}

export function normalizeFrame(srcFrame, opts = {}) {
  const {
    tier = 32,
    cellW = tier,
    cellH = tier,
    preScale = 1,
    flipX = false,
    pivotMode = 'feet', // 'feet' | 'center' | 'grip'
    outlineMode = '4conn', // '4conn' | 'none'
    outlineColor = NORM_CONSTANTS.OUTLINE_RGBA,
    stripExistingOutline: doStrip = false,
    binaryAlpha = outlineMode === '4conn',
    lutStrength = 1.0,
    alphaCutoff = NORM_CONSTANTS.ALPHA_CUTOFF,
    bboxCutoff = binaryAlpha ? alphaCutoff : 1,
    footPadBottom = NORM_CONSTANTS.FOOT_PAD_BOTTOM,
    anchorFootCenterX = null,
    gripX: customGripX = null,
    gripY: customGripY = null,
  } = opts;

  let work = flipX ? flipImageX(srcFrame) : cloneImage(srcFrame);
  if (preScale !== 1) work = scaleImage(work, preScale);
  if (binaryAlpha) work = hardenAlpha(work, alphaCutoff);
  if (doStrip) work = stripDarkOutline(work, { alphaCutoff: bboxCutoff });

  const bbox = getOpaqueBBox(work, bboxCutoff);
  if (bbox.empty) {
    const blank = createImage(cellW, cellH);
    const offX = -Math.floor(cellW / 2);
    const offY = pivotMode === 'center' ? -Math.floor(cellH / 2) : -(cellH - footPadBottom);
    return {
      frame: blank,
      bbox,
      footCenterX: Math.floor(work.width / 2),
      offX,
      offY,
      cellW,
      cellH,
      gripX: Math.floor(cellW / 2),
      gripY: Math.floor(cellH / 2),
    };
  }

  const trimmed = cropImage(work, bbox.minX, bbox.minY, bbox.width, bbox.height);
  const computedFootX = computeFootCenterX(work, bbox, bboxCutoff);
  const footCenterX = anchorFootCenterX ?? computedFootX;

  let dstX, dstY, offX, offY, gripX = Math.floor(cellW / 2), gripY = Math.floor(cellH / 2);

  if (pivotMode === 'feet') {
    const localFootX = footCenterX - bbox.minX;
    dstX = Math.floor(cellW / 2) - localFootX;
    dstY = (cellH - 1 - footPadBottom) - (bbox.height - 1);
    offX = -Math.floor(cellW / 2);
    offY = -(cellH - footPadBottom);
  } else if (pivotMode === 'center') {
    dstX = Math.floor((cellW - bbox.width) / 2);
    dstY = Math.floor((cellH - bbox.height) / 2);
    offX = -Math.floor(cellW / 2);
    offY = -Math.floor(cellH / 2);
  } else if (pivotMode === 'grip') {
    dstX = Math.floor((cellW - bbox.width) / 2);
    dstY = Math.floor((cellH - bbox.height) / 2);
    gripX = customGripX ?? Math.max(1, Math.min(cellW - 2, dstX + Math.round(bbox.width * 0.25)));
    gripY = customGripY ?? Math.max(1, Math.min(cellH - 2, dstY + Math.round(bbox.height * 0.55)));
    offX = -gripX;
    offY = -gripY;
  } else {
    throw new Error(`Unknown pivotMode: ${pivotMode}`);
  }

  // Clamp placement inside [1..cellW-2, 1..cellH-1-footPadBottom] only if content fits cell without clipping vital bounds;
  // otherwise allow standard blit clipping at cell edges while leaving 1px guard when possible.
  const canvas = createImage(cellW, cellH);
  blitImage(canvas, trimmed, dstX, dstY);

  // Quantize interior pixels before 1px outline while keeping any #181425 ink intact
  let styled = lutStrength > 0
    ? quantizeImageToPalette48(canvas, { lutStrength, alphaCutoff: bboxCutoff, preserveOutline: true })
    : canvas;

  if (outlineMode === '4conn') {
    styled = applyOutline4Conn(styled, outlineColor, alphaCutoff);
  }

  return {
    frame: styled,
    bbox,
    footCenterX,
    offX,
    offY,
    cellW,
    cellH,
    gripX,
    gripY,
  };
}

export function packStrip(frames, cellW, cellH) {
  if (!frames || frames.length === 0) {
    throw new Error('packStrip requires at least 1 frame');
  }
  const sheet = createImage(frames.length * cellW, cellH);
  for (let i = 0; i < frames.length; i++) {
    blitImage(sheet, frames[i], i * cellW, 0);
  }
  return {
    sheet,
    width: sheet.width,
    height: sheet.height,
    frames: frames.length,
    cellW,
    cellH,
    pngBuffer: encodePng(sheet),
  };
}

export function packFeetAnchorSheet(rawFrames, opts = {}) {
  if (!rawFrames || rawFrames.length === 0) {
    throw new Error('packFeetAnchorSheet requires at least 1 frame');
  }
  const {
    tier = 32,
    autoPromote = false,
    preScale = 1,
    flipX = false,
    outlineMode = '4conn',
    binaryAlpha = outlineMode === '4conn',
    alphaCutoff = NORM_CONSTANTS.ALPHA_CUTOFF,
    bboxCutoff = binaryAlpha ? alphaCutoff : 1,
  } = opts;

  let targetTier = tier;
  let cellW = opts.cellW ?? targetTier;
  let cellH = opts.cellH ?? targetTier;

  // Check if auto-promotion is needed when using standard square tiers
  if (autoPromote && opts.cellW == null && opts.cellH == null) {
    let maxW = 0, maxH = 0;
    for (const f of rawFrames) {
      let tmp = flipX ? flipImageX(f) : f;
      if (preScale !== 1) tmp = scaleImage(tmp, preScale);
      const box = getOpaqueBBox(tmp, bboxCutoff);
      if (!box.empty) {
        if (box.width > maxW) maxW = box.width;
        if (box.height > maxH) maxH = box.height;
      }
    }
    targetTier = promoteTier(tier, maxW, maxH);
    cellW = targetTier;
    cellH = targetTier;
  }

  let anchorFootCenterX = opts.anchorFootCenterX ?? null;
  const normalizedFrames = [];
  let meta = null;

  for (let i = 0; i < rawFrames.length; i++) {
    const res = normalizeFrame(rawFrames[i], {
      ...opts,
      tier: targetTier,
      cellW,
      cellH,
      anchorFootCenterX,
    });
    if (i === 0) {
      meta = res;
      if (opts.lockFirstFrameFoot && anchorFootCenterX == null) {
        anchorFootCenterX = res.footCenterX;
      }
    }
    normalizedFrames.push(res.frame);
  }

  const packed = packStrip(normalizedFrames, cellW, cellH);
  return {
    ...packed,
    tier: targetTier,
    offX: meta.offX,
    offY: meta.offY,
    footCenterX: meta.footCenterX,
    gripX: meta.gripX,
    gripY: meta.gripY,
  };
}

// ---------------------------------------------------------------------------
// Pure-Node PCM WAV Codec, Normalizer & Trimmer (d15 §5, d16 §3)
// ---------------------------------------------------------------------------

export function parseWav(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buf.length < 44 || buf.subarray(0, 4).toString('ascii') !== 'RIFF' || buf.subarray(8, 12).toString('ascii') !== 'WAVE') {
    throw new Error('Invalid RIFF/WAVE header');
  }

  let fmt = null;
  let dataChunk = null;
  let offset = 12;

  while (offset + 8 <= buf.length) {
    const id = buf.subarray(offset, offset + 4).toString('ascii');
    const size = buf.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = Math.min(buf.length, start + size);
    if (id === 'fmt ') {
      if (end - start < 16) throw new Error('Truncated WAV fmt chunk');
      let audioFormat = buf.readUInt16LE(start);
      const numChannels = buf.readUInt16LE(start + 2);
      const sampleRate = buf.readUInt32LE(start + 4);
      const bitsPerSample = buf.readUInt16LE(start + 14);
      if (audioFormat === 0xfffe && end - start >= 40) {
        // WAVE_FORMAT_EXTENSIBLE SubFormat GUID first 2 bytes
        audioFormat = buf.readUInt16LE(start + 24);
      }
      fmt = { audioFormat, numChannels, sampleRate, bitsPerSample };
    } else if (id === 'data') {
      dataChunk = buf.subarray(start, end);
    }
    offset = start + size + (size & 1); // RIFF word-aligned
  }

  if (!fmt || !dataChunk) {
    throw new Error('WAV missing required fmt or data chunk');
  }
  const { audioFormat, numChannels, sampleRate, bitsPerSample } = fmt;
  if (numChannels <= 0 || sampleRate <= 0) {
    throw new Error(`Invalid WAV format: ch=${numChannels} sr=${sampleRate}`);
  }
  if (audioFormat !== 1 && audioFormat !== 3) {
    throw new Error(`Unsupported WAV audioFormat=${audioFormat} (only PCM=1 and IEEE_FLOAT=3 supported)`);
  }

  const bytesPerSample = bitsPerSample / 8;
  const frameSize = bytesPerSample * numChannels;
  const samplesPerChannel = Math.floor(dataChunk.length / frameSize);
  const channels = Array.from({ length: numChannels }, () => new Float32Array(samplesPerChannel));

  for (let i = 0; i < samplesPerChannel; i++) {
    const frameBase = i * frameSize;
    for (let ch = 0; ch < numChannels; ch++) {
      const p = frameBase + ch * bytesPerSample;
      let val;
      if (audioFormat === 3 && bitsPerSample === 32) {
        val = dataChunk.readFloatLE(p);
      } else if (audioFormat === 3 && bitsPerSample === 64) {
        val = dataChunk.readDoubleLE(p);
      } else if (audioFormat === 1 && bitsPerSample === 8) {
        val = (dataChunk[p] - 128) / 128;
      } else if (audioFormat === 1 && bitsPerSample === 16) {
        val = dataChunk.readInt16LE(p) / 32768;
      } else if (audioFormat === 1 && bitsPerSample === 24) {
        let s = dataChunk[p] | (dataChunk[p + 1] << 8) | (dataChunk[p + 2] << 16);
        if (s & 0x800000) s |= ~0xffffff;
        val = s / 8388608;
      } else if (audioFormat === 1 && bitsPerSample === 32) {
        val = dataChunk.readInt32LE(p) / 2147483648;
      } else {
        throw new Error(`Unsupported WAV PCM bit depth: ${bitsPerSample} (format=${audioFormat})`);
      }
      channels[ch][i] = Math.max(-1, Math.min(1, Number.isFinite(val) ? val : 0));
    }
  }

  return {
    audioFormat,
    numChannels,
    sampleRate,
    bitsPerSample,
    samplesPerChannel,
    durationMs: Math.round((samplesPerChannel / sampleRate) * 1000),
    channels,
  };
}

export const readWav = parseWav;

export function encodeWav(samplesOrChannels, opts = {}) {
  const { sampleRate = WAV_CONSTANTS.DEFAULT_SAMPLE_RATE, bitsPerSample = 16 } = opts;
  if (bitsPerSample !== 16) {
    throw new Error(`encodeWav currently emits 16-bit PCM; got bitsPerSample=${bitsPerSample}`);
  }
  const channels = Array.isArray(samplesOrChannels) && ArrayBuffer.isView(samplesOrChannels[0])
    ? samplesOrChannels
    : [samplesOrChannels instanceof Float32Array ? samplesOrChannels : Float32Array.from(samplesOrChannels)];

  const numChannels = channels.length;
  const samplesPerChannel = channels[0]?.length ?? 0;
  const blockAlign = numChannels * 2;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samplesPerChannel * blockAlign;
  const buf = Buffer.allocUnsafe(44 + dataSize);

  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataSize, 40);

  let pos = 44;
  for (let i = 0; i < samplesPerChannel; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, channels[ch][i] || 0));
      const i16 = s < 0 ? Math.round(s * 32768) : Math.round(s * 32767);
      buf.writeInt16LE(Math.max(-32768, Math.min(32767, i16)), pos);
      pos += 2;
    }
  }
  return buf;
}

export const writeWav = encodeWav;

export async function readWavFile(filePath) {
  return parseWav(await fs.readFile(filePath));
}

export async function writeWavFile(filePath, samplesOrChannels, opts = {}) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, encodeWav(samplesOrChannels, opts));
}

export function downmixToMono(channels) {
  if (channels.length === 1) return new Float32Array(channels[0]);
  const n = channels[0].length;
  const mono = new Float32Array(n);
  const inv = 1 / channels.length;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let c = 0; c < channels.length; c++) sum += channels[c][i];
    mono[i] = sum * inv;
  }
  return mono;
}

export function resamplePcm(channels, srcRate, dstRate) {
  if (srcRate === dstRate) return channels.map((c) => new Float32Array(c));
  const srcLen = channels[0].length;
  const dstLen = Math.max(1, Math.round((srcLen * dstRate) / srcRate));
  const ratio = srcRate / dstRate;
  return channels.map((ch) => {
    const out = new Float32Array(dstLen);
    for (let i = 0; i < dstLen; i++) {
      const pos = i * ratio;
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const a = ch[Math.min(srcLen - 1, idx)];
      const b = ch[Math.min(srcLen - 1, idx + 1)];
      out[i] = a + (b - a) * frac;
    }
    return out;
  });
}

export function removeDcOffset(channels) {
  return channels.map((ch) => {
    if (ch.length === 0) return new Float32Array(0);
    let sum = 0;
    for (let i = 0; i < ch.length; i++) sum += ch[i];
    const mean = sum / ch.length;
    const out = new Float32Array(ch.length);
    for (let i = 0; i < ch.length; i++) out[i] = ch[i] - mean;
    return out;
  });
}

export function trimWavSilence(channels, sampleRate, opts = {}) {
  const {
    headThreshold = WAV_CONSTANTS.HEAD_TRIM_THRESHOLD,
    tailThreshold = WAV_CONSTANTS.TAIL_TRIM_THRESHOLD,
    preRollMs = WAV_CONSTANTS.PRE_ROLL_MS,
    tailPadMs = WAV_CONSTANTS.TAIL_PAD_MS,
  } = opts;
  const n = channels[0]?.length ?? 0;
  if (n === 0) return { channels: channels.map(() => new Float32Array(0)), startSample: 0, endSample: 0 };

  const framePeak = (i) => {
    let m = 0;
    for (let c = 0; c < channels.length; c++) {
      const a = Math.abs(channels[c][i]);
      if (a > m) m = a;
    }
    return m;
  };

  let i0 = 0;
  while (i0 < n && framePeak(i0) < headThreshold) i0++;
  if (i0 >= n) {
    // Pure silence: keep minimal safe stub
    return { channels: channels.map((ch) => ch.slice(0, Math.min(n, Math.round(sampleRate * 0.05)))), startSample: 0, endSample: Math.min(n, Math.round(sampleRate * 0.05)) };
  }

  let i1 = n - 1;
  while (i1 > i0 && framePeak(i1) < tailThreshold) i1--;

  const preRoll = Math.round((preRollMs / 1000) * sampleRate);
  const tailPad = Math.round((tailPadMs / 1000) * sampleRate);
  const startSample = Math.max(0, i0 - preRoll);
  const endSample = Math.min(n, i1 + 1 + tailPad);

  return {
    channels: channels.map((ch) => ch.slice(startSample, endSample)),
    startSample,
    endSample,
  };
}

export function applyEdgeFades(channels, sampleRate, opts = {}) {
  const {
    fadeInMs = WAV_CONSTANTS.FADE_IN_MS,
    fadeOutMs = WAV_CONSTANTS.FADE_OUT_MS,
    fadeInThreshold = 0.02,
    loopCrossfadeMs = 0,
  } = opts;
  const out = channels.map((ch) => new Float32Array(ch));
  const n = out[0]?.length ?? 0;
  if (n === 0) return out;

  const fadeInSamples = Math.min(Math.floor(n / 2), Math.round((fadeInMs / 1000) * sampleRate));
  const fadeOutSamples = Math.min(Math.floor(n / 2), Math.round((fadeOutMs / 1000) * sampleRate));

  if (loopCrossfadeMs > 0) {
    const xf = Math.min(Math.floor(n / 4), Math.round((loopCrossfadeMs / 1000) * sampleRate));
    if (xf > 1) {
      for (const ch of out) {
        const seam = 0.5 * (ch[0] + ch[n - 1]);
        for (let i = 0; i < xf; i++) {
          const w = 0.5 * (1 - Math.cos((Math.PI * i) / xf));
          ch[i] = seam * (1 - w) + ch[i] * w;
          const tailIdx = n - 1 - i;
          ch[tailIdx] = seam * (1 - w) + ch[tailIdx] * w;
        }
      }
    }
    return out;
  }

  for (const ch of out) {
    if (fadeInSamples > 0 && Math.abs(ch[0]) > fadeInThreshold) {
      for (let i = 0; i < fadeInSamples; i++) {
        ch[i] *= i / fadeInSamples;
      }
    }
    if (fadeOutSamples > 0) {
      for (let i = 0; i < fadeOutSamples; i++) {
        const t = i / fadeOutSamples;
        const gain = 0.5 * (1 + Math.cos(Math.PI * t)); // raised cosine fade-out
        ch[n - fadeOutSamples + i] *= gain;
      }
    }
  }
  return out;
}

export function measurePcmStats(channels) {
  let peak = 0;
  let sumSq = 0;
  let count = 0;
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) {
      const s = ch[i];
      const a = Math.abs(s);
      if (a > peak) peak = a;
      sumSq += s * s;
      count++;
    }
  }
  const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
  const toDb = (lin) => (lin > 1e-8 ? 20 * Math.log10(lin) : -120);
  return {
    peak,
    peakDb: Number(toDb(peak).toFixed(2)),
    rms,
    rmsDb: Number(toDb(rms).toFixed(2)),
  };
}

export function normalizeWavVolume(channels, opts = {}) {
  const {
    targetRmsDb = WAV_CONSTANTS.SFX_TARGET_RMS_DB,
    peakCeilingDb = WAV_CONSTANTS.PEAK_CEILING_DB,
    peakOnly = false,
  } = opts;
  const ceiling = Math.pow(10, peakCeilingDb / 20);
  const { peak, rms } = measurePcmStats(channels);
  if (peak < 1e-7) {
    return {
      channels: channels.map((c) => new Float32Array(c)),
      peakDb: -120,
      rmsDb: -120,
      appliedGain: 1,
      softClipped: false,
    };
  }

  const targetRms = Math.pow(10, targetRmsDb / 20);
  let gain = peakOnly ? (ceiling / peak) : (targetRms / Math.max(rms, 1e-5));
  let softClipped = false;
  const projectedPeak = peak * gain;

  const out = channels.map((ch) => new Float32Array(ch.length));
  if (!peakOnly && projectedPeak > ceiling) {
    const overshootRatio = projectedPeak / ceiling;
    if (overshootRatio <= 1.4125375) {
      // Gentle soft-knee tanh limiter when overshoot <= +3 dB (d16 §3 step 5)
      softClipped = true;
      for (let c = 0; c < channels.length; c++) {
        for (let i = 0; i < channels[c].length; i++) {
          out[c][i] = Math.tanh((channels[c][i] * gain) / ceiling) * ceiling;
        }
      }
    } else {
      gain = ceiling / peak;
      for (let c = 0; c < channels.length; c++) {
        for (let i = 0; i < channels[c].length; i++) {
          out[c][i] = channels[c][i] * gain;
        }
      }
    }
  } else {
    if (projectedPeak > ceiling) gain = ceiling / peak;
    for (let c = 0; c < channels.length; c++) {
      for (let i = 0; i < channels[c].length; i++) {
        out[c][i] = channels[c][i] * gain;
      }
    }
  }

  const finalStats = measurePcmStats(out);
  return {
    channels: out,
    peakDb: finalStats.peakDb,
    rmsDb: finalStats.rmsDb,
    appliedGain: gain,
    softClipped,
  };
}

export function sliceFirstTransient(channels, sampleRate, opts = {}) {
  const {
    onsetThreshold = 0.01259, // -38 dBFS (d10 §5)
    silenceThreshold = 0.00794, // -42 dBFS
    minSilenceGapMs = 50,
    maxDurationMs = 550,
  } = opts;
  const n = channels[0]?.length ?? 0;
  if (n === 0) return channels;

  const peakAt = (i) => {
    let m = 0;
    for (let c = 0; c < channels.length; c++) {
      const a = Math.abs(channels[c][i]);
      if (a > m) m = a;
    }
    return m;
  };

  let start = 0;
  while (start < n && peakAt(start) < onsetThreshold) start++;
  if (start >= n) start = 0;
  start = Math.max(0, start - Math.round(0.002 * sampleRate));

  const maxSamples = Math.round((maxDurationMs / 1000) * sampleRate);
  const gapSamples = Math.round((minSilenceGapMs / 1000) * sampleRate);
  const limit = Math.min(n, start + maxSamples);
  let silentRun = 0;
  let end = limit;
  const minHold = start + Math.round(0.03 * sampleRate);

  for (let i = start; i < limit; i++) {
    if (peakAt(i) < silenceThreshold) {
      silentRun++;
      if (i > minHold && silentRun >= gapSamples) {
        end = i - gapSamples + Math.round(0.01 * sampleRate);
        break;
      }
    } else {
      silentRun = 0;
    }
  }
  return channels.map((ch) => ch.slice(start, Math.max(start + 1, end)));
}

export function normalizeWav(bufOrChannels, opts = {}) {
  const isParsed = !Buffer.isBuffer(bufOrChannels) && !(bufOrChannels instanceof Uint8Array);
  const parsed = isParsed ? bufOrChannels : parseWav(bufOrChannels);
  const {
    targetSampleRate = WAV_CONSTANTS.DEFAULT_SAMPLE_RATE,
    mono = true,
    isBgm = false,
    removeDc = true,
    trimSilence = !isBgm,
    firstTransientOnly = false,
    maxDurationMs = null,
    targetRmsDb = isBgm ? WAV_CONSTANTS.BGM_TARGET_RMS_DB : WAV_CONSTANTS.SFX_TARGET_RMS_DB,
    peakCeilingDb = WAV_CONSTANTS.PEAK_CEILING_DB,
    peakOnly = false,
  } = opts;

  let sampleRate = parsed.sampleRate;
  let channels = parsed.channels;

  if (mono && channels.length > 1) {
    channels = [downmixToMono(channels)];
  }
  if (targetSampleRate && sampleRate !== targetSampleRate) {
    channels = resamplePcm(channels, sampleRate, targetSampleRate);
    sampleRate = targetSampleRate;
  }
  if (removeDc) {
    channels = removeDcOffset(channels);
  }
  if (firstTransientOnly) {
    channels = sliceFirstTransient(channels, sampleRate, { maxDurationMs: maxDurationMs ?? 550 });
  } else if (trimSilence) {
    channels = trimWavSilence(channels, sampleRate, opts).channels;
  }
  if (maxDurationMs != null && !firstTransientOnly) {
    const cap = Math.round((maxDurationMs / 1000) * sampleRate);
    if (channels[0].length > cap) {
      channels = channels.map((ch) => ch.slice(0, cap));
    }
  }

  channels = applyEdgeFades(channels, sampleRate, {
    loopCrossfadeMs: isBgm ? WAV_CONSTANTS.LOOP_CROSSFADE_MS : 0,
    ...opts,
  });

  const normed = normalizeWavVolume(channels, { targetRmsDb, peakCeilingDb, peakOnly });
  const wavBuffer = encodeWav(normed.channels, { sampleRate, bitsPerSample: 16 });
  const samplesPerChannel = normed.channels[0]?.length ?? 0;

  return {
    wavBuffer,
    channels: normed.channels,
    sampleRate,
    numChannels: normed.channels.length,
    samplesPerChannel,
    durationMs: Math.round((samplesPerChannel / sampleRate) * 1000),
    peakDb: normed.peakDb,
    rmsDb: normed.rmsDb,
    softClipped: normed.softClipped,
  };
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Magic-Byte Detection, Hashing, Retry Fetch & Zip-Slip-Safe Extraction
// ---------------------------------------------------------------------------

export const MAGIC_SIGNATURES = Object.freeze({
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  jpg: [0xff, 0xd8, 0xff],
  gif: [0x47, 0x49, 0x46, 0x38],
  ogg: [0x4f, 0x67, 0x67, 0x53],
  zip: [0x50, 0x4b, 0x03, 0x04],
  '7z': [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c],
});

function startsWithBytes(buf, sig) {
  if (buf.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (buf[i] !== sig[i]) return false;
  }
  return true;
}

export function detectMagicFormat(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buf.length < 4) return null;
  if (startsWithBytes(buf, MAGIC_SIGNATURES.png)) return 'png';
  if (startsWithBytes(buf, MAGIC_SIGNATURES.jpg)) return 'jpg';
  if (startsWithBytes(buf, MAGIC_SIGNATURES.gif)) return 'gif';
  if (startsWithBytes(buf, MAGIC_SIGNATURES.ogg)) return 'ogg';
  if (startsWithBytes(buf, MAGIC_SIGNATURES.zip) || startsWithBytes(buf, [0x50, 0x4b, 0x05, 0x06])) return 'zip';
  if (startsWithBytes(buf, MAGIC_SIGNATURES['7z'])) return '7z';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF') {
    const fourcc = buf.subarray(8, 12).toString('ascii');
    if (fourcc === 'WAVE') return 'wav';
    if (fourcc === 'WEBP') return 'webp';
  }
  if (buf.subarray(0, 3).toString('ascii') === 'ID3') return 'mp3';
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'mp3';
  const head = buf.subarray(0, Math.min(buf.length, 64)).toString('utf8').trimStart().toLowerCase();
  if (head.startsWith('<!doctype') || head.startsWith('<html')) return 'html';
  if (head.startsWith('{') || head.startsWith('[')) return 'json';
  return null;
}

export function assertMagicFormat(buf, expected, context = 'buffer') {
  const actual = detectMagicFormat(buf);
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!actual || !allowed.includes(actual)) {
    throw new Error(`Magic-byte mismatch for ${context}: expected [${allowed.join('|')}], detected ${actual ?? 'unknown'} (len=${buf.length})`);
  }
  return actual;
}

export function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export async function fetchBuffer(url, opts = {}) {
  const {
    timeoutMs = 15000,
    retries = 2,
    maxBytes = 52_428_800, // 50 MB (d15 §2)
    expect = null,
    allowHttp = false,
    headers = {},
  } = opts;

  const parsedUrl = new URL(url);
  if (!allowHttp && parsedUrl.protocol !== 'https:') {
    throw new Error(`Blocked non-HTTPS URL: ${url}`);
  }
  if (allowHttp && parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    throw new Error(`Unsupported URL protocol: ${parsedUrl.protocol}`);
  }

  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'User-Agent': 'BanSung-AssetPipeline/1.0 (+Node22)',
          ...headers,
        },
      });

      if (res.url) {
        const finalProto = new URL(res.url).protocol;
        if (!allowHttp && finalProto !== 'https:') {
          throw new Error(`Redirected to non-HTTPS URL: ${res.url}`);
        }
      }

      if (!res.ok) {
        const statusErr = new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
        statusErr.status = res.status;
        const retryable = res.status === 429 || res.status >= 500;
        if (!retryable || attempt === retries) throw statusErr;
        lastErr = statusErr;
        const waitMs = 400 * (attempt + 1);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      const contentLen = Number(res.headers.get('content-length') || 0);
      if (contentLen > maxBytes) {
        throw new Error(`Response Content-Length ${contentLen} exceeds maxBytes ${maxBytes} for ${url}`);
      }

      const chunks = [];
      let total = 0;
      if (res.body) {
        for await (const chunk of res.body) {
          total += chunk.byteLength;
          if (total > maxBytes) {
            throw new Error(`Downloaded stream exceeded maxBytes ${maxBytes} for ${url}`);
          }
          chunks.push(chunk);
        }
      } else {
        const arrBuf = await res.arrayBuffer();
        if (arrBuf.byteLength > maxBytes) {
          throw new Error(`Downloaded payload ${arrBuf.byteLength} exceeded maxBytes ${maxBytes} for ${url}`);
        }
        chunks.push(Buffer.from(arrBuf));
      }

      const buffer = Buffer.concat(chunks);
      const format = expect ? assertMagicFormat(buffer, expect, url) : detectMagicFormat(buffer);
      if (format === 'html' && !expect) {
        throw new Error(`Received unexpected HTML response instead of binary asset for ${url}`);
      }

      return {
        buffer,
        format,
        status: res.status,
        url: res.url || url,
        contentType: res.headers.get('content-type') || '',
        sha256: sha256Hex(buffer),
        bytes: buffer.length,
      };
    } catch (err) {
      lastErr = err;
      const nonRetryable = err?.status && err.status >= 400 && err.status < 500 && err.status !== 429;
      if (nonRetryable || attempt === retries) throw err;
      const backoff = 400 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr ?? new Error(`fetchBuffer failed for ${url}`);
}

export async function fetchToFile(url, destPath, opts = {}) {
  const { force = false, expectedSha256 = null, expect = null } = opts;
  if (!force) {
    try {
      const existing = await fs.readFile(destPath);
      const sha256 = sha256Hex(existing);
      const format = expect ? assertMagicFormat(existing, expect, destPath) : detectMagicFormat(existing);
      if (!expectedSha256 || sha256 === expectedSha256) {
        return { path: destPath, format, sha256, bytes: existing.length, cached: true };
      }
    } catch {
      // Cache miss or corrupt; re-fetch
    }
  }
  const result = await fetchBuffer(url, opts);
  if (expectedSha256 && result.sha256 !== expectedSha256) {
    throw new Error(`SHA-256 mismatch for ${url}: expected ${expectedSha256}, got ${result.sha256}`);
  }
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, result.buffer);
  return { path: destPath, format: result.format, sha256: result.sha256, bytes: result.bytes, cached: false };
}

function sanitizeZipEntryPath(destDir, rawName) {
  if (rawName.includes('\0')) throw new Error(`Zip entry contains null byte: ${rawName}`);
  const normalizedSlashes = rawName.replaceAll('\\', '/');
  if (normalizedSlashes.startsWith('/') || /^[a-zA-Z]:/.test(normalizedSlashes)) {
    throw new Error(`Zip-slip blocked (absolute path): ${rawName}`);
  }
  const resolvedDest = path.resolve(destDir);
  const resolvedTarget = path.resolve(resolvedDest, normalizedSlashes);
  if (resolvedTarget !== resolvedDest && !resolvedTarget.startsWith(resolvedDest + path.sep)) {
    throw new Error(`Zip-slip blocked (traversal): ${rawName}`);
  }
  return resolvedTarget;
}

export async function extractZipSafe(zipPathOrBuf, destDir, opts = {}) {
  const { maxTotalBytes = 200 * 1024 * 1024, filter = null } = opts;
  const buf = Buffer.isBuffer(zipPathOrBuf) ? zipPathOrBuf : await fs.readFile(zipPathOrBuf);
  assertMagicFormat(buf, 'zip', typeof zipPathOrBuf === 'string' ? zipPathOrBuf : 'zipBuffer');

  // Locate End of Central Directory record (0x06054b50)
  let eocdOffset = -1;
  const minOffset = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= minOffset; i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error('ZIP End of Central Directory not found');

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);
  if (cdOffset >= buf.length) throw new Error('Invalid ZIP central directory offset');

  const entries = [];
  let cursor = cdOffset;
  let totalUncompressed = 0;

  for (let idx = 0; idx < totalEntries; idx++) {
    if (cursor + 46 > buf.length || buf.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error(`Invalid ZIP central directory entry at index ${idx}`);
    }
    const flags = buf.readUInt16LE(cursor + 8);
    const method = buf.readUInt16LE(cursor + 10);
    const compressedSize = buf.readUInt32LE(cursor + 20);
    const uncompressedSize = buf.readUInt32LE(cursor + 24);
    const nameLen = buf.readUInt16LE(cursor + 28);
    const extraLen = buf.readUInt16LE(cursor + 30);
    const commentLen = buf.readUInt16LE(cursor + 32);
    const externalAttr = buf.readUInt32LE(cursor + 38);
    const localHeaderOffset = buf.readUInt32LE(cursor + 42);
    const nameBuf = buf.subarray(cursor + 46, cursor + 46 + nameLen);
    const name = nameBuf.toString((flags & 0x800) ? 'utf8' : 'latin1');
    cursor += 46 + nameLen + extraLen + commentLen;

    // Validate EVERY entry path against zip-slip even if filtered
    const targetPath = sanitizeZipEntryPath(destDir, name);
    const isSymlink = ((externalAttr >>> 16) & 0o170000) === 0o120000;
    if (isSymlink) throw new Error(`Zip symlink blocked: ${name}`);

    if (name.endsWith('/')) continue;
    if (filter && !filter(name)) continue;

    totalUncompressed += uncompressedSize;
    if (totalUncompressed > maxTotalBytes) {
      throw new Error(`ZIP uncompressed size exceeds cap (${maxTotalBytes} bytes)`);
    }

    entries.push({ name, targetPath, method, compressedSize, uncompressedSize, localHeaderOffset });
  }

  await fs.mkdir(destDir, { recursive: true });
  const extracted = [];
  let needsFallback = false;

  for (const e of entries) {
    if (e.method !== 0 && e.method !== 8) {
      needsFallback = true;
      break;
    }
    const lh = e.localHeaderOffset;
    if (lh + 30 > buf.length || buf.readUInt32LE(lh) !== 0x04034b50) {
      throw new Error(`Invalid ZIP local file header for ${e.name}`);
    }
    const lhNameLen = buf.readUInt16LE(lh + 26);
    const lhExtraLen = buf.readUInt16LE(lh + 28);
    const dataStart = lh + 30 + lhNameLen + lhExtraLen;
    const compData = buf.subarray(dataStart, dataStart + e.compressedSize);
    const outData = e.method === 0 ? compData : zlib.inflateRawSync(compData);
    await fs.mkdir(path.dirname(e.targetPath), { recursive: true });
    await fs.writeFile(e.targetPath, outData);
    extracted.push(e.targetPath);
  }

  if (needsFallback) {
    if (typeof zipPathOrBuf !== 'string') {
      throw new Error('Unsupported ZIP compression method in buffer (cannot invoke system extractor)');
    }
    if (process.platform === 'win32') {
      await execFileAsync('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-Command',
        'Expand-Archive', '-LiteralPath', zipPathOrBuf, '-DestinationPath', destDir, '-Force',
      ]);
    } else {
      await execFileAsync('unzip', ['-oq', zipPathOrBuf, '-d', destDir]);
    }
    return entries.map((e) => e.targetPath);
  }

  return extracted;
}

// ---------------------------------------------------------------------------
// Pure-Node OGG (Vorbis/Opus) & MP3 Header/Duration Inspectors
// ---------------------------------------------------------------------------

const MPEG_V1_L3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const MPEG_V2_L3_BITRATES = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
const MPEG_SAMPLERATES = {
  3: [44100, 48000, 32000], // MPEG 1
  2: [22050, 24000, 16000], // MPEG 2
  0: [11025, 12000, 8000],  // MPEG 2.5
};

/** Inspect OGG Vorbis/Opus stream metadata and duration from final granule position. */
export function inspectOggInfo(buf) {
  if (buf.length < 28 || buf.subarray(0, 4).toString('ascii') !== 'OggS') {
    throw new Error('Invalid OGG magic header');
  }
  const numSegs = buf[26];
  const payloadStart = 27 + numSegs;
  let sampleRate = WAV_CONSTANTS.DEFAULT_SAMPLE_RATE;
  let channels = 1;
  let codec = 'vorbis';

  if (payloadStart + 16 <= buf.length) {
    const sig7 = buf.subarray(payloadStart, payloadStart + 7).toString('latin1');
    const sig8 = buf.subarray(payloadStart, payloadStart + 8).toString('ascii');
    if (sig7 === '\x01vorbis' && payloadStart + 16 <= buf.length) {
      channels = buf[payloadStart + 11] || 1;
      sampleRate = buf.readUInt32LE(payloadStart + 12) || WAV_CONSTANTS.DEFAULT_SAMPLE_RATE;
      codec = 'vorbis';
    } else if (sig8 === 'OpusHead' && payloadStart + 12 <= buf.length) {
      channels = buf[payloadStart + 9] || 1;
      sampleRate = 48000;
      codec = 'opus';
    }
  }

  let granule = 0n;
  for (let i = buf.length - 27; i >= 0; i--) {
    if (
      buf[i] === 0x4f &&
      buf[i + 1] === 0x67 &&
      buf[i + 2] === 0x67 &&
      buf[i + 3] === 0x53 &&
      buf[i + 4] === 0 &&
      buf[i + 5] <= 7
    ) {
      granule = buf.readBigInt64LE(i + 6);
      if (granule > 0n) break;
    }
  }

  const durationMs = granule > 0n && sampleRate > 0
    ? Math.max(1, Math.round((Number(granule) / sampleRate) * 1000))
    : null;

  return { codec, channels, sampleRate, durationMs };
}

/** Walk MPEG audio frames (after optional ID3v2 tag) to compute duration and format info. */
export function inspectMp3Info(buf) {
  let pos = 0;
  if (buf.length >= 10 && buf.subarray(0, 3).toString('ascii') === 'ID3') {
    const tagSize =
      ((buf[6] & 0x7f) << 21) |
      ((buf[7] & 0x7f) << 14) |
      ((buf[8] & 0x7f) << 7) |
      (buf[9] & 0x7f);
    pos = Math.min(buf.length, 10 + tagSize);
  }

  let totalDurationMs = 0;
  let sampleRate = WAV_CONSTANTS.DEFAULT_SAMPLE_RATE;
  let channels = 1;
  let frames = 0;

  while (pos + 4 <= buf.length) {
    if (buf[pos] !== 0xff || (buf[pos + 1] & 0xe0) !== 0xe0) {
      pos++;
      continue;
    }
    const b1 = buf[pos + 1];
    const b2 = buf[pos + 2];
    const b3 = buf[pos + 3];
    const version = (b1 >> 3) & 0x03;
    const layer = (b1 >> 1) & 0x03;
    const bitrateIdx = (b2 >> 4) & 0x0f;
    const srIdx = (b2 >> 2) & 0x03;
    const padding = (b2 >> 1) & 0x01;
    const channelMode = (b3 >> 6) & 0x03;

    const srTable = MPEG_SAMPLERATES[version];
    if (!srTable || layer === 0 || bitrateIdx === 0 || bitrateIdx === 15 || srIdx === 3) {
      pos++;
      continue;
    }

    const sr = srTable[srIdx];
    const isMpeg1 = version === 3;
    let bitrateKbps = 0;
    let samplesPerFrame = 1152;
    let frameSize = 0;

    if (layer === 1) {
      bitrateKbps = isMpeg1 ? MPEG_V1_L3_BITRATES[bitrateIdx] : MPEG_V2_L3_BITRATES[bitrateIdx];
      samplesPerFrame = isMpeg1 ? 1152 : 576;
      frameSize = Math.floor(((samplesPerFrame / 8) * (bitrateKbps * 1000)) / sr) + padding;
    } else if (layer === 2) {
      bitrateKbps = isMpeg1 ? MPEG_V1_L3_BITRATES[bitrateIdx] : MPEG_V2_L3_BITRATES[bitrateIdx];
      samplesPerFrame = 1152;
      frameSize = Math.floor(((samplesPerFrame / 8) * (bitrateKbps * 1000)) / sr) + padding;
    } else {
      bitrateKbps = MPEG_V1_L3_BITRATES[bitrateIdx];
      samplesPerFrame = 384;
      frameSize = (Math.floor((12 * (bitrateKbps * 1000)) / sr) + padding) * 4;
    }

    if (frameSize < 4 || pos + frameSize > buf.length) break;

    if (frames === 0) {
      sampleRate = sr;
      channels = channelMode === 3 ? 1 : 2;
    }
    frames++;
    totalDurationMs += (samplesPerFrame / sr) * 1000;
    pos += frameSize;
  }

  return {
    codec: 'mp3',
    channels,
    sampleRate,
    frames,
    durationMs: frames > 0 ? Math.max(1, Math.round(totalDurationMs)) : null,
  };
}
