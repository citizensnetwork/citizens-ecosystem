// WebP crop helper (Designer build, phase 3): turns one screenshot into the `data:image/webp` string a card's `before`
// or `refImage` field holds, under the field's cap. capture.mjs writes PNG; the headless Chromium it already uses can
// encode WebP from a canvas, so this adds no dependency (Playwright is already a dev dependency of this app).
//
//   node scripts/design/image-webp.mjs <image.png|.jpg|.webp> --out <file.txt> [--crop x,y,w,h] [--max-width 480] [--max-chars 40960]
//
// It draws the (cropped) image at most `--max-width` pixels wide, tries a descending run of qualities, and shrinks the
// width by a fifth and tries again until the string fits `--max-chars` (default 40 KB, the `refImage` cap; use 61440
// for a `before`). The string goes to `--out` (it is too long to print); the line printed is its size. A reference
// picture is a CROP of the relevant part of another product's public screen, never a full screen: pass `--crop`.
import { readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseWebpDataUrl } from './webp.mjs';

export const DEFAULT_MAX_CHARS = 40 * 1024;
export const DEFAULT_MAX_WIDTH = 480;
const QUALITIES = [0.8, 0.65, 0.5, 0.4, 0.3, 0.2];
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

/**
 * "x,y,w,h" in source pixels.
 * @param {string} text
 * @returns {{x: number, y: number, w: number, h: number}}
 */
export function parseCrop(text) {
  const parts = String(text).split(',');
  const [x, y, w, h] = parts.map((p) => (/^\d{1,5}$/.test(p.trim()) ? Number(p.trim()) : NaN));
  if (parts.length !== 4 || [x, y, w, h].some(Number.isNaN) || w < 1 || h < 1) {
    throw new Error('--crop wants four whole numbers x,y,w,h (source pixels), with a width and height of at least 1');
  }
  return { x, y, w, h };
}

/**
 * @param {string} inputPath
 * @param {{crop?: {x: number, y: number, w: number, h: number}, maxWidth?: number, maxChars?: number}} [options]
 * @returns {Promise<{dataUrl: string, chars: number, bytes: number, width: number, height: number, quality: number}>}
 */
export async function encodeWebp(inputPath, options = {}) {
  const mime = MIME[extname(inputPath).toLowerCase()];
  if (!mime) throw new Error('the image must be a .png, .jpg or .webp file');
  const maxWidth = options.maxWidth ?? DEFAULT_MAX_WIDTH;
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const source = `data:${mime};base64,${readFileSync(inputPath).toString('base64')}`;

  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const found = await page.evaluate(
      async ({ source, crop, maxWidth, maxChars, qualities }) => {
        const image = new Image();
        image.src = source;
        await image.decode();
        const box = crop ?? { x: 0, y: 0, w: image.naturalWidth, h: image.naturalHeight };
        if (box.x + box.w > image.naturalWidth || box.y + box.h > image.naturalHeight) {
          throw new Error(`the crop reaches outside the ${image.naturalWidth}x${image.naturalHeight} image`);
        }
        let width = Math.min(maxWidth, box.w);
        for (let step = 0; step < 14 && width >= 16; step++) {
          const height = Math.max(1, Math.round((box.h * width) / box.w));
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d').drawImage(image, box.x, box.y, box.w, box.h, 0, 0, width, height);
          for (const quality of qualities) {
            const dataUrl = canvas.toDataURL('image/webp', quality);
            if (!dataUrl.startsWith('data:image/webp')) throw new Error('this browser cannot encode WebP');
            if (dataUrl.length <= maxChars) return { dataUrl, quality };
          }
          width = Math.floor(width * 0.8);
        }
        return null;
      },
      { source, crop: options.crop ?? null, maxWidth, maxChars, qualities: QUALITIES },
    );
    if (!found) throw new Error(`could not get the image under ${maxChars} characters; crop a smaller part`);
    const parsed = parseWebpDataUrl(found.dataUrl);
    if (!parsed.ok) throw new Error(`the browser wrote something that is not a WebP: ${parsed.reason}`);
    return { dataUrl: found.dataUrl, chars: parsed.chars, bytes: parsed.bytes, width: parsed.width, height: parsed.height, quality: found.quality };
  } finally {
    await browser.close();
  }
}

function option(args, name) {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
}

/** A whole number of at least 1, or undefined when the option was not given. */
export function positiveInt(name, text) {
  if (text === undefined) return undefined;
  if (!/^\d{1,7}$/.test(text) || Number(text) < 1) throw new Error(`${name} wants a whole number of at least 1`);
  return Number(text);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const input = args[0];
  const out = option(args, '--out');
  if (!input || input.startsWith('--') || !out) {
    console.error('usage: node scripts/design/image-webp.mjs <image.png|jpg|webp> --out <file.txt> [--crop x,y,w,h] [--max-width 480] [--max-chars 40960]');
    process.exit(2);
  }
  try {
    const crop = option(args, '--crop');
    const width = option(args, '--max-width');
    const chars = option(args, '--max-chars');
    const result = await encodeWebp(input, {
      crop: crop === undefined ? undefined : parseCrop(crop),
      maxWidth: positiveInt('--max-width', width),
      maxChars: positiveInt('--max-chars', chars),
    });
    writeFileSync(out, result.dataUrl);
    console.log(`ok    ${out} (${result.chars} characters, ${result.bytes} bytes, ${result.width}x${result.height}, quality ${result.quality})`);
  } catch (error) {
    console.error(`FAIL  ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
