/**
 * Screenshots of the six Map v2 card variants (issue #222).
 * Renders the real MapV2Card and map-v2.css. Fixture names only.
 * Writes apps/connect/docs/card-anatomy/{variant}-{light|dark}-{375|768|1280}.png
 *
 *   node scripts/card-anatomy-shots.mjs
 */
import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, '..');
const outDir = join(appRoot, 'docs/card-anatomy');
const reactUmd = join(appRoot, 'node_modules/react/umd/react.development.js');
const reactDomUmd = join(appRoot, 'node_modules/react-dom/umd/react-dom.development.js');

const photo = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <rect width="640" height="360" fill="#c4b49a"/>
  <circle cx="500" cy="80" r="36" fill="#e8d48b"/>
  <path d="M0 250 L160 170 L280 220 L420 140 L640 230 L640 360 L0 360 Z" fill="#5c5444"/>
</svg>`;
const mark = `<svg xmlns="http://www.w3.org/2000/svg" width="112" height="112" viewBox="0 0 112 112">
  <rect width="112" height="112" fill="#ffffff"/>
  <circle cx="56" cy="56" r="28" fill="none" stroke="#8b6914" stroke-width="6"/>
</svg>`;

const files = {
  '/photo.svg': { type: 'image/svg+xml', body: photo },
  '/mark.svg': { type: 'image/svg+xml', body: mark },
  '/react.js': { type: 'text/javascript', body: readFileSync(reactUmd) },
  '/react-dom.js': { type: 'text/javascript', body: readFileSync(reactDomUmd) },
  '/data.js': { type: 'text/javascript', body: readFileSync(join(appRoot, 'src/frontend/app/data.jsx')) },
  '/strings.js': { type: 'text/javascript', body: readFileSync(join(appRoot, 'src/frontend/app/map-v2-strings.jsx')) },
  '/card.js': { type: 'text/javascript', body: readFileSync(join(appRoot, 'src/frontend/app/map-v2-card.jsx')) },
  '/map-v2.css': { type: 'text/css', body: readFileSync(join(appRoot, 'src/frontend/assets/map-v2.css')) },
};

const pageHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <script>if (location.search.indexOf('theme=dark') !== -1) document.documentElement.dataset.theme = 'dark';</script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600&amp;display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/map-v2.css" />
  <style>
    html, body { margin: 0; background: var(--surface-0); color: var(--text-1); }
    body { font-family: var(--font-body); }
    main { display: flex; flex-direction: column; }
  </style>
</head>
<body>
  <main id="app"></main>
  <script src="/react.js"></script>
  <script src="/react-dom.js"></script>
  <script src="/data.js"></script>
  <script src="/strings.js"></script>
  <script src="/card.js"></script>
  <script>
    window.Icon = function Icon(props) {
      return React.createElement('svg', {
        'data-icon': props.name, width: props.size, height: props.size, viewBox: '0 0 24 24', 'aria-hidden': 'true',
      }, React.createElement('polygon', { points: '8,5 19,12 8,19', fill: 'currentColor' }));
    };
    window.UI = {
      safeUrl: function (u) {
        var t = String(u || '').trim();
        if (t.charAt(0) === '/' && t.indexOf('//') !== 0) return t;
        return /^https?:\\/\\//i.test(t) ? t : '';
      },
    };
    var h = React.createElement;
    var Card = window.MapV2Card;
    var shots = [
      ['text', { variant: 'text', title: 'Saturday note', excerpt: 'A short note about the morning gathering.', meta: ['3 days ago'], moreLabel: 'Read more', onClick: function () {} }],
      ['image', { variant: 'image', title: 'Market morning', excerpt: 'Stalls open from nine.', meta: ['3 days ago'], media: { src: '/photo.svg' }, onClick: function () {} }],
      ['video', { variant: 'video', title: 'Morning service', meta: ['12 min · 3 days ago'], media: { src: '/photo.svg' }, href: 'https://example.org/watch', duration: '12:04' }],
      ['audio', { variant: 'audio', title: 'Evening hour', meta: ['18:00'], media: { src: '/mark.svg' }, href: 'https://example.org/listen', live: true }],
      ['event', { variant: 'event', item: { type: 'event', category: 'care-recovery' }, kind: 'Event', title: 'Care circle', date: { day: '14', month: 'Oct' }, meta: ['Starts Wed, 10:00', 'Pretoria', { text: 'With Fixture Fellowship', host: true }], onClick: function () {} }],
      ['listing', { variant: 'listing', item: { type: 'place', category: 'hospitality-cafes' }, kind: 'Place', title: 'Corner cafe', meta: ['1.2 km away'], media: { src: '/mark.svg' }, openState: { status: 'open', text: 'Open · closes 17:00' }, onClick: function () {} }],
    ];
    ReactDOM.createRoot(document.getElementById('app')).render(
      h('main', null, shots.map(function (row) {
        return h('div', { key: row[0], 'data-shot': row[0] }, h(Card, row[1]));
      })),
    );
  </script>
</body>
</html>`;

files['/'] = { type: 'text/html; charset=utf-8', body: pageHtml };

const server = createServer((req, res) => {
  const path = new URL(req.url || '/', 'http://127.0.0.1').pathname;
  const hit = files[path];
  if (!hit) {
    res.writeHead(404);
    res.end('missing');
    return;
  }
  res.writeHead(200, { 'content-type': hit.type });
  res.end(hit.body);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const origin = `http://127.0.0.1:${port}/`;

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const variants = ['text', 'image', 'video', 'audio', 'event', 'listing'];
const themes = ['light', 'dark'];
const widths = [375, 768, 1280];

try {
  for (const theme of themes) {
    const page = await browser.newPage({ deviceScaleFactor: 2 });
    await page.setViewportSize({ width: 375, height: 1400 });
    const url = theme === 'dark' ? origin + '?theme=dark' : origin;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    const ink = await page.evaluate(async () => {
      await document.fonts.ready;
      const card = document.querySelector("[data-mv2='card2']");
      return {
        theme: document.documentElement.dataset.theme || 'light',
        bg: getComputedStyle(card).backgroundColor,
        fg: getComputedStyle(card).color,
      };
    });
    if (theme === 'dark' && ink.bg === 'rgb(255, 255, 255)') throw new Error('dark theme did not apply: ' + JSON.stringify(ink));
    if (theme === 'light' && ink.bg !== 'rgb(255, 255, 255)') throw new Error('light theme did not apply: ' + JSON.stringify(ink));
    console.log(theme, ink);
    await page.waitForFunction(() => [...document.images].every((img) => img.complete && img.naturalWidth > 0));
    for (const width of widths) {
      await page.setViewportSize({ width, height: 1600 });
      for (const variant of variants) {
        const el = page.locator(`[data-shot="${variant}"] [data-mv2="card2"]`);
        await el.screenshot({ path: join(outDir, `${variant}-${theme}-${width}.png`) });
      }
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

console.log(`wrote ${variants.length * themes.length * widths.length} cards to ${outDir}`);
