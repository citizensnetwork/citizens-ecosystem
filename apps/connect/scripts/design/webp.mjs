// A WebP image carried as a `data:` URL: the one image format a Designer card may hold (`before`, `refImage`).
// Pure and dependency-free, so the card validator, the encoder helper and the tests share one reading of "is this really a
// WebP". The container is checked, not just the prefix: a label that says WebP above bytes that are something else must fail.
//
// Sizes in the card caps (designer.md section 5) count the `data:` string itself, so `chars` is the number to compare.

// Linear: a literal prefix, then one character class with a bounded tail.
export const WEBP_DATA_URL = /^data:image\/webp;base64,([A-Za-z0-9+/]*={0,2})$/;

/**
 * Reads the RIFF/WebP header of `bytes`.
 * @param {Buffer} bytes
 * @returns {{ok: true, format: 'VP8' | 'VP8L' | 'VP8X', width: number, height: number} | {ok: false, reason: string}}
 */
export function webpInfo(bytes) {
  if (bytes.length < 16 || bytes.toString('latin1', 0, 4) !== 'RIFF' || bytes.toString('latin1', 8, 12) !== 'WEBP') {
    return { ok: false, reason: 'the bytes are not a RIFF/WebP file' };
  }
  if (bytes.readUInt32LE(4) + 8 > bytes.length) return { ok: false, reason: 'the WebP file is cut short' };
  const chunk = bytes.toString('latin1', 12, 16);
  if (chunk === 'VP8X' && bytes.length >= 30) {
    return { ok: true, format: 'VP8X', width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
  }
  if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const bits = bytes.readUInt32LE(21);
    return { ok: true, format: 'VP8L', width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
  }
  if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return { ok: true, format: 'VP8', width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  }
  return { ok: false, reason: `unknown or truncated WebP chunk "${chunk.trim()}"` };
}

/**
 * @param {unknown} value
 * @returns {{ok: true, chars: number, bytes: number, format: string, width: number, height: number} | {ok: false, reason: string}}
 */
export function parseWebpDataUrl(value) {
  if (typeof value !== 'string') return { ok: false, reason: 'the image is not a string' };
  const match = WEBP_DATA_URL.exec(value);
  if (!match) return { ok: false, reason: 'the image is not a data:image/webp;base64 URL' };
  if (match[1].length % 4 !== 0) return { ok: false, reason: 'the base64 text is the wrong length' };
  const bytes = Buffer.from(match[1], 'base64');
  const info = webpInfo(bytes);
  if (!info.ok) return info;
  return { ok: true, chars: value.length, bytes: bytes.length, format: info.format, width: info.width, height: info.height };
}
