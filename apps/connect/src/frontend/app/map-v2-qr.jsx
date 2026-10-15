// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — QR code encoder (tracker P2-06, no new dependency: gate G2)
//  ------------------------------------------------------------------
//  Turns a short link (a Contributor's /c/<slug>) into the modules of a QR code that can be
//  printed at a venue. ISO/IEC 18004 "QR Code Model 2", byte mode (UTF-8), error correction
//  level M (about 15 % of the symbol can be damaged and it still reads), versions 1 to 10
//  (up to 213 bytes: a listing link is about 60). Longer text returns null; the caller then
//  shows no QR code rather than a wrong one.
//
//  Pure functions, no DOM: the sheet draws the result (map-v2-sheet.jsx). Verified by decoding
//  the generated symbols with an independent reader (src/__tests__/frontend/mapV2Qr.test.ts).
//
//  Also here: the Dialog the sheet opens (drawn from the numbers only: no markup is built from text)
//  and "Save image" (a PNG drawn on a canvas, 1000 px or more, white margin included).
//
//  Public surface: window.MapV2QR = { encode, pathData, Dialog, MAX_BYTES, PUBLIC_ORIGIN }.
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const { useRef, useEffect, useMemo } = React;
  const useBackGuard = window.useBackGuard || function () {};
  // A printed code must always open the public site, never the page it was made on (a preview, localhost, the app shell)
  const PUBLIC_ORIGIN = 'https://www.citizenscentral.co.za';
  // Level M, versions 1 to 10: error-correction codewords per block, and the blocks as [count, data codewords].
  const SPEC = {
    1: { ec: 10, blocks: [[1, 16]] },
    2: { ec: 16, blocks: [[1, 28]] },
    3: { ec: 26, blocks: [[1, 44]] },
    4: { ec: 18, blocks: [[2, 32]] },
    5: { ec: 24, blocks: [[2, 43]] },
    6: { ec: 16, blocks: [[4, 27]] },
    7: { ec: 18, blocks: [[4, 31]] },
    8: { ec: 22, blocks: [[2, 38], [2, 39]] },
    9: { ec: 22, blocks: [[3, 36], [2, 37]] },
    10: { ec: 26, blocks: [[4, 43], [1, 44]] },
  };
  const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };
  const FORMAT_M = 0;   // the two format bits of level M

  const dataCodewords = (v) => SPEC[v].blocks.reduce((n, b) => n + b[0] * b[1], 0);
  // byte mode: 4 mode bits + an 8-bit length (versions 1 to 9) or 16-bit (10) + 8 bits a byte
  const capacity = (v) => Math.floor((dataCodewords(v) * 8 - 4 - (v < 10 ? 8 : 16)) / 8);
  const MAX_BYTES = capacity(10);

  // ── Galois field 2^8 (x^8 + x^4 + x^3 + x^2 + 1) and Reed-Solomon ───
  const EXP = new Array(512);
  const LOG = new Array(256);
  (function () {
    let x = 1;
    for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);
  function generator(deg) {
    let g = [1];
    for (let i = 0; i < deg; i++) {
      const next = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= mul(g[j], EXP[i]); }
      g = next;
    }
    return g;   // highest power first, monic
  }
  function remainder(data, deg) {
    const g = generator(deg);
    const r = new Array(deg).fill(0);
    for (const d of data) {
      const f = d ^ r[0];
      r.shift(); r.push(0);
      for (let i = 0; i < deg; i++) r[i] ^= mul(g[i + 1], f);
    }
    return r;
  }

  // ── the bit stream ─────────────────────────────────────────────────
  function utf8(text) {
    if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(text));
    const out = [];
    const s = unescape(encodeURIComponent(text));
    for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }
  function codewordsFor(bytes, v) {
    const bits = [];
    const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(0b0100, 4);
    put(bytes.length, v < 10 ? 8 : 16);
    bytes.forEach((b) => put(b, 8));
    const total = dataCodewords(v) * 8;
    put(0, Math.min(4, total - bits.length));      // terminator
    while (bits.length % 8) bits.push(0);
    const out = [];
    for (let i = 0; i < bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    for (let pad = 0xec; out.length < dataCodewords(v); pad ^= 0xec ^ 0x11) out.push(pad);
    return out;
  }
  // split into blocks, add each block's error-correction codewords, interleave
  function interleave(data, v) {
    const { ec, blocks } = SPEC[v];
    const dataBlocks = [];
    let at = 0;
    blocks.forEach(([count, len]) => { for (let i = 0; i < count; i++) { dataBlocks.push(data.slice(at, at + len)); at += len; } });
    const ecBlocks = dataBlocks.map((b) => remainder(b, ec));
    const out = [];
    const longest = Math.max(...dataBlocks.map((b) => b.length));
    for (let i = 0; i < longest; i++) dataBlocks.forEach((b) => { if (i < b.length) out.push(b[i]); });
    for (let i = 0; i < ec; i++) ecBlocks.forEach((b) => out.push(b[i]));
    return out;
  }

  // ── the matrix ─────────────────────────────────────────────────────
  const bit = (n, i) => ((n >>> i) & 1) !== 0;
  function build(v, codewords) {
    const size = 17 + 4 * v;
    const mod = Array.from({ length: size }, () => new Array(size).fill(false));
    const fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, dark) => { mod[y][x] = dark; fn[y][x] = true; };

    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, Math.max(Math.abs(dx), Math.abs(dy)) !== 2 && Math.max(Math.abs(dx), Math.abs(dy)) !== 4);
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const pos = ALIGN[v];
    pos.forEach((cx, i) => pos.forEach((cy, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));
    const formatBits = (mask) => {
      const data = (FORMAT_M << 3) | mask;
      let rem = data;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      return ((data << 10) | rem) ^ 0x5412;
    };
    const drawFormat = (mask) => {
      const b = formatBits(mask);
      for (let i = 0; i <= 5; i++) set(8, i, bit(b, i));
      set(8, 7, bit(b, 6)); set(8, 8, bit(b, 7)); set(7, 8, bit(b, 8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, bit(b, i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(b, i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(b, i));
      set(8, size - 8, true);       // the one fixed dark module
    };
    drawFormat(0);                  // reserves the format areas before the data is placed
    if (v >= 7) {
      let rem = v;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const b = (v << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const a = size - 11 + (i % 3), c = Math.floor(i / 3);
        set(a, c, bit(b, i)); set(c, a, bit(b, i));
      }
    }

    // the data, zig-zag from the bottom right in two-column strips, skipping the timing column
    let k = 0;
    const totalBits = codewords.length * 8;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
          if (!fn[y][x] && k < totalBits) { mod[y][x] = bit(codewords[k >>> 3], 7 - (k & 7)); k++; }
        }
      }
    }
    return { size, mod, fn, drawFormat };
  }
  const MASKS = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0,
  ];
  function applyMask(q, m) {
    for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) if (!q.fn[y][x] && MASKS[m](x, y)) q.mod[y][x] = !q.mod[y][x];
  }
  // the four penalty rules of the standard: the lowest total is the most readable mask
  function penalty(q) {
    const n = q.size, m = q.mod;
    let p = 0;
    const lines = [];
    for (let i = 0; i < n; i++) { lines.push(m[i]); lines.push(m.map((row) => row[i])); }
    for (const line of lines) {
      let run = 1;
      for (let i = 1; i <= n; i++) {
        if (i < n && line[i] === line[i - 1]) run++;
        else { if (run >= 5) p += 3 + (run - 5); run = 1; }
      }
      const s = line.map((d) => (d ? '1' : '0')).join('');
      for (let i = 0; i + 11 <= n; i++) { const w = s.slice(i, i + 11); if (w === '10111010000' || w === '00001011101') p += 40; }
    }
    for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
    let dark = 0;
    for (const row of m) for (const d of row) if (d) dark++;
    p += 10 * Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n));
    return p;
  }

  // ── public ─────────────────────────────────────────────────────────
  // text -> { version, size, modules: boolean[][] } (true = dark), or null when it does not fit
  function encode(text) {
    const bytes = utf8(String(text == null ? '' : text));
    let v = 1;
    while (v <= 10 && capacity(v) < bytes.length) v++;
    if (v > 10) return null;
    const q = build(v, interleave(codewordsFor(bytes, v), v));
    let best = -1, bestScore = Infinity;
    for (let m = 0; m < 8; m++) {
      applyMask(q, m); q.drawFormat(m);
      const s = penalty(q);
      if (s < bestScore) { bestScore = s; best = m; }
      applyMask(q, m);
    }
    applyMask(q, best); q.drawFormat(best);
    return { version: v, size: q.size, modules: q.mod.map((r) => r.slice()) };
  }

  // One SVG path for the dark modules (horizontal runs, so the string stays short), in module units, with
  // `quiet` empty modules around it (the standard asks for 4). Returns { size, d } where size includes the border.
  function pathData(qr, quiet) {
    const b = quiet === undefined ? 4 : quiet;
    const parts = [];
    for (let y = 0; y < qr.size; y++) {
      for (let x = 0; x < qr.size; x++) {
        if (!qr.modules[y][x]) continue;
        let w = 1;
        while (x + w < qr.size && qr.modules[y][x + w]) w++;
        parts.push('M' + (x + b) + ' ' + (y + b) + 'h' + w + 'v1h-' + w + 'z');
        x += w - 1;
      }
    }
    return { size: qr.size + 2 * b, d: parts.join('') };
  }

  // PNG of the symbol: at least 1000 px a side, black on white, with the quiet zone
  function savePng(qr, fileName) {
    const quiet = 4;
    const cells = qr.size + 2 * quiet;
    const scale = Math.max(8, Math.ceil(1000 / cells));
    const px = cells * scale;
    const c = document.createElement('canvas');
    c.width = px; c.height = px;
    const g = c.getContext('2d');
    if (!g) return;
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, px, px);
    g.fillStyle = '#000000';
    for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) if (qr.modules[y][x]) g.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
    c.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }

  // The dialog (rendered into <body> by the sheet). One useBackGuard entry like the photo viewer: Back, Escape and Close
  // each close only this; focus goes back to the button that opened it.
  function Dialog({ url, name, slug, strings, onClose, returnFocus }) {
    const closeBtn = useRef(null);
    useBackGuard(true, onClose);
    useEffect(() => {
      if (closeBtn.current) closeBtn.current.focus({ preventScroll: true });
      return () => { if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true }); };
    }, []);
    useEffect(() => {
      // capture, so the sheet's own Escape handler (bubble phase) never sees this key
      const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); onClose(); } };
      document.addEventListener('keydown', onKey, true);
      return () => document.removeEventListener('keydown', onKey, true);
    });
    const qr = useMemo(() => encode(url), [url]);
    if (!qr) return null;
    const p = pathData(qr, 4);
    // Inside the Capacitor phone app a blob download does nothing (the web view has no download handler), and a button
    // that silently does nothing is worse than none: there, no Save button, and a screenshot is the way to keep it.
    const native = !!(window.CapCore && window.CapCore.isNativePlatform && window.CapCore.isNativePlatform());
    return h('div', { 'data-mv2': 'qr', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'mv2-qr-title' },
      h('div', { 'data-mv2': 'qr-card' },
        h('h2', { id: 'mv2-qr-title', 'data-mv2': 'qr-title' }, strings.title(name)),
        h('svg', { 'data-mv2': 'qr-img', viewBox: '0 0 ' + p.size + ' ' + p.size, role: 'img', 'aria-label': strings.imageLabel(name, url), shapeRendering: 'crispEdges' },
          h('rect', { width: p.size, height: p.size, fill: '#ffffff' }),
          h('path', { d: p.d, fill: '#000000' })),
        h('p', { 'data-mv2': 'qr-url' }, url),
        h('p', { 'data-mv2': 'qr-hint' }, strings.hint),
        h('p', { 'data-mv2': 'qr-hint' }, native ? strings.screenshotHint : strings.printHint),
        h('div', { 'data-mv2': 'qr-actions' },
          !native && h('button', { type: 'button', 'data-mv2': 'action', 'data-primary': '', onClick: () => savePng(qr, strings.fileName(String(slug).replace(/[^a-zA-Z0-9-]/g, ''))) }, strings.save),
          h('button', { type: 'button', ref: closeBtn, 'data-mv2': 'action', 'aria-label': strings.close, onClick: onClose }, 'Close'))));
  }

  window.MapV2QR = { encode, pathData, Dialog, MAX_BYTES, PUBLIC_ORIGIN };
})();
