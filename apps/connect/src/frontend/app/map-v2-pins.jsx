// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Map v2 pins (tracker P1-04). Used by map.jsx ONLY when
//  window.isMapV2() is true; with the flag off this file is never called.
//  ------------------------------------------------------------------
//  What changes against v1 (docs/MAP_UX_TRACKER.md §8 P1-04, decisions D8):
//    · Contributor: a 48 px circle on a tail. BELOW the photo zoom (15) it shows
//      the category glyph on the category colour (founder's map-layering.md: no
//      pictures at mid zoom); AT AND ABOVE it, its logo (a small category
//      glyph badge keeps a non-colour cue). The SELECTED pin always shows its logo.
//    · Place and Event keep their v1 shapes (circle / rounded rectangle with a
//      nub): a venue, a gathering and an organisation stay distinguishable (Q2).
//    · Every pin is a real control: role=button, tabindex=0, aria-label
//      "{name}, {category}", Enter / Space, a visible focus ring, a 44 px hit area.
//    · Only transform and opacity ever animate; no looping pulse (calm motion,
//      tracker §2.3 principle 3). A live event gets a static dot and "live now" in
//      its label instead.
//    · Selection toggles a class on the pin that is already there (no rebuild of
//      every marker per tap), so the 200 ms scale can actually animate.
//    · "+N" overlap badge and label collision hiding run when the map goes
//      IDLE, never per frame.
//    · Inner nodes carry NO class attribute (data-mv2="..." instead; only the root
//      pin has classes): the Tailwind Play CDN re-reads the classes under every
//      element whose attributes change, and a marker's style changes on every
//      frame of a pan. Measured 2026-10-10 on 150 pins at CPU x4: classes on every
//      inner node cost +31 ms p95 per frame (127 ms with, 96 ms without).
//  Styles live in assets/map-v2.css (tokens only). Colours come from the
//  category data; text/glyph colour is chosen per fill for >= 4.5:1.
// ════════════════════════════════════════════════════════════════════
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const INK = '#0A0908';   // near-black glyph colour (same value as --accent-contrast)
  const WHITE = '#FFFFFF';
  const OVERLAP_PX = 28;   // pins closer than this on screen count as overlapping

  // ── pure helpers (unit-tested in src/__tests__/frontend/mapV2Pins.test.ts) ──
  // Logo at and above the photo zoom; the selected pin always shows it.
  const photoShown = (zoom, photoZoom, selected) => !!selected || zoom >= photoZoom;

  const lum = (hex) => {
    const h = String(hex).replace('#', '');
    const v = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  // White or near-black, whichever reads better on this fill: always >= 4.5:1.
  const glyphColor = (fillHex) => (ratio(WHITE, fillHex) >= ratio(INK, fillHex) ? WHITE : INK);

  // S = window.MapV2Strings.pin ({ listing, live }): no text of its own lives in this file.
  const ariaLabelFor = (m, categoryLabel, S) => {
    const bits = [(m && m.title) || S.listing];
    if (categoryLabel) bits.push(categoryLabel);
    if (m && m.isLive) bits.push(S.live);
    return bits.join(', ');
  };

  // Who keeps a label / is the head of an overlap group: the selected pin, then a
  // pin with an UPCOMING event (soonest first), then the most recent activity, then
  // the name (stable, never popularity). `nextEventAt` / `lastActivityAt` are epoch ms.
  function comparePriority(a, b) {
    if (!!a.selected !== !!b.selected) return a.selected ? -1 : 1;
    const an = typeof a.nextEventAt === 'number', bn = typeof b.nextEventAt === 'number';
    if (an !== bn) return an ? -1 : 1;
    if (an && bn && a.nextEventAt !== b.nextEventAt) return a.nextEventAt - b.nextEventAt;
    const aa = typeof a.lastActivityAt === 'number' ? a.lastActivityAt : -Infinity;
    const ba = typeof b.lastActivityAt === 'number' ? b.lastActivityAt : -Infinity;
    if (aa !== ba) return ba - aa;
    const t = String(a.title || '').localeCompare(String(b.title || ''));
    return t !== 0 ? t : String(a.id).localeCompare(String(b.id));
  }

  // Group pins whose screen positions are within `minDist` of each other (single link).
  // Returns [{ head, count }] for groups of 2+; `head` is the highest-priority member.
  // items: [{ id, x, y, selected?, nextEventAt?, lastActivityAt?, title? }]
  function overlapGroups(items, minDist) {
    const n = items.length;
    const parent = items.map((_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    // grid hashing keeps this near-linear for a few hundred pins
    const cell = Math.max(1, minDist);
    const grid = new Map();
    items.forEach((it, i) => {
      const cx = Math.floor(it.x / cell), cy = Math.floor(it.y / cell);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const bucket = grid.get((cx + dx) + ':' + (cy + dy));
          if (!bucket) continue;
          for (const j of bucket) {
            const ddx = it.x - items[j].x, ddy = it.y - items[j].y;
            if (ddx * ddx + ddy * ddy <= minDist * minDist) parent[find(i)] = find(j);
          }
        }
      }
      const key = cx + ':' + cy;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(i);
    });
    const groups = new Map();
    for (let i = 0; i < n; i++) { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(items[i]); }
    const out = [];
    groups.forEach((members) => {
      if (members.length < 2) return;
      members.sort(comparePriority);
      out.push({ head: members[0], count: members.length });
    });
    return out;
  }

  // Greedy label collision: walk labels by priority, keep one only if it overlaps no kept
  // label (rects inflated by `pad`). Returns the ids to HIDE. labels: [{ id, x, y, w, h, ...priority }]
  function hiddenLabels(labels, pad) {
    const sorted = labels.slice().sort(comparePriority);
    const kept = [];
    const hide = [];
    for (const l of sorted) {
      const hit = kept.some((k) => l.x < k.x + k.w + pad && l.x + l.w + pad > k.x && l.y < k.y + k.h + pad && l.y + l.h + pad > k.y);
      if (hit && !l.selected) hide.push(l.id); else kept.push(l);
    }
    return hide;
  }

  // ── DOM builders ───────────────────────────────────────────────────
  function glyphSvg(inner, part) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('data-mv2', part);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.innerHTML = inner;
    return svg;
  }

  // Place / Event / Idea keep their v1 silhouettes; the hairline is a wider dark stroke under the
  // white one, and the glyph colour is picked per fill. Geometry mirrors map.jsx pinSvg.
  function shapeSvg({ shape, hex, glyph, selected }) {
    const svg = document.createElementNS(NS, 'svg');
    let w, h, body, gx, gy, gsize;
    if (shape === 'event') {
      w = selected ? 48 : 40; h = selected ? 38 : 32;
      const nub = 7, r = 9, cx = w / 2, pad = 3;
      const W = w + pad * 2, H = h + nub + pad * 2;
      const x0 = pad, y0 = pad, x1 = pad + w, y1 = pad + h, ncx = pad + cx;
      const d = 'M' + (x0 + r) + ' ' + y0 + ' H' + (x1 - r) + ' A' + r + ' ' + r + ' 0 0 1 ' + x1 + ' ' + (y0 + r) +
        ' V' + (y1 - r) + ' A' + r + ' ' + r + ' 0 0 1 ' + (x1 - r) + ' ' + y1 + ' H' + (ncx + 5) + ' L' + ncx + ' ' + (y1 + nub) +
        ' L' + (ncx - 5) + ' ' + y1 + ' H' + (x0 + r) + ' A' + r + ' ' + r + ' 0 0 1 ' + x0 + ' ' + (y1 - r) +
        ' V' + (y0 + r) + ' A' + r + ' ' + r + ' 0 0 1 ' + (x0 + r) + ' ' + y0 + ' Z';
      body = '<path data-mv2="shape-hair" d="' + d + '"/><path data-mv2="shape" d="' + d + '" fill="' + hex + '"/>';
      gsize = Math.round(h * 0.58); gx = pad + cx - gsize / 2; gy = pad + h / 2 - gsize / 2;
      w = W; h = H;
    } else {
      const dd = selected ? 38 : 30, pad = 3, W = dd + pad * 2, c = pad + dd / 2;
      body = '<circle data-mv2="shape-hair" cx="' + c + '" cy="' + c + '" r="' + (dd / 2 - 1.25) + '"/>' +
        '<circle data-mv2="shape" cx="' + c + '" cy="' + c + '" r="' + (dd / 2 - 1.25) + '" fill="' + hex + '"/>';
      gsize = Math.round(dd * 0.46); gx = c - gsize / 2; gy = c - gsize / 2;
      w = W; h = W;
    }
    svg.setAttribute('data-cc-pin', shape);
    svg.setAttribute('data-mv2', 'shape-svg');
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = body + (glyph
      ? '<g transform="translate(' + gx + ' ' + gy + ') scale(' + (gsize / 24) + ')" fill="none" stroke="' + glyphColor(hex) +
        '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + glyph + '</g>'
      : '');
    return svg;
  }

  /**
   * Build one pin's inner node.
   * m: { id, type, title, category, kind, profilePhoto, isLive, isBusy, broadcast }
   * deps: { lucideInner(name), icon (glyph name), hex (fill colour), strings (MapV2Strings.pin), onDismissBubble }
   * Returns the node; `.mv2-pin` carries data-state hooks the map toggles later.
   */
  function build(m, deps) {
    const hex = deps.hex;
    const root = document.createElement('div');
    root.className = 'mv2-pin mv2-pin--' + m.type;
    root.style.setProperty('--pin-cat', hex);
    root.style.setProperty('--pin-glyph', glyphColor(hex));
    const glyphInner = deps.lucideInner(deps.icon);

    if (m.type === 'contributor') {
      const bodyEl = document.createElement('span');
      bodyEl.setAttribute('data-mv2', 'body');
      const tail = document.createElement('span');
      tail.setAttribute('data-mv2', 'tail');
      const disc = document.createElement('span');
      disc.setAttribute('data-mv2', 'disc');
      disc.setAttribute('data-cc-pin', 'contributor');
      disc.appendChild(glyphSvg(glyphInner, 'glyph'));
      if (m.profilePhoto) {
        root.classList.add('has-logo');
        disc.setAttribute('data-cc-logo', '1');
        const wrap = document.createElement('span');
        wrap.setAttribute('data-mv2', 'logo-wrap');
        if (m.kind === 'individual') wrap.setAttribute('data-photo', '1');
        const img = document.createElement('img');
        img.setAttribute('data-mv2', 'logo');
        img.alt = '';
        img.decoding = 'async';
        img.width = 96; img.height = 96;
        img.setAttribute('data-src', m.profilePhoto);
        img.onload = () => { root.classList.add('is-loaded'); };
        img.onerror = () => { root.classList.add('is-broken'); };
        wrap.appendChild(img);
        disc.appendChild(wrap);
        const badge = document.createElement('span');
        badge.setAttribute('data-mv2', 'badge');
        badge.appendChild(glyphSvg(glyphInner, 'badge-glyph'));
        bodyEl.appendChild(badge);
      }
      bodyEl.insertBefore(tail, bodyEl.firstChild);
      bodyEl.insertBefore(disc, tail.nextSibling);
      root.appendChild(bodyEl);
    } else {
      const bodyEl = document.createElement('span');
      bodyEl.setAttribute('data-mv2', 'body');
      const isIdea = m.type === 'idea';
      // selected scale is a CSS transform on the body, so the SVG is always drawn at rest size
      bodyEl.appendChild(shapeSvg({ shape: isIdea ? 'idea' : m.type === 'event' ? 'event' : 'place', hex, glyph: glyphInner, selected: false }));
      root.appendChild(bodyEl);
    }

    if (m.isLive || m.isBusy) {
      const dot = document.createElement('span');
      dot.setAttribute('data-mv2', 'live');
      dot.setAttribute('aria-hidden', 'true');
      root.appendChild(dot);
    }

    if (m.broadcast && m.broadcast.message) {
      const b = document.createElement('div');
      b.setAttribute('data-mv2', 'bubble');
      const txt = document.createElement('span');
      txt.setAttribute('data-mv2', 'bubble-text');
      txt.textContent = m.broadcast.message;
      b.appendChild(txt);
      if (m.broadcast.bubbleId && deps.onDismissBubble) {
        const x = document.createElement('button');
        x.type = 'button';
        x.setAttribute('data-mv2', 'bubble-x');
        x.textContent = '×';
        x.setAttribute('aria-label', deps.strings.dismissUpdate);
        x.addEventListener('click', (e) => { e.stopPropagation(); deps.onDismissBubble(m.broadcast.bubbleId, m.id); });
        b.appendChild(x);
      }
      root.appendChild(b);
    }

    if (m.title) {
      const l = document.createElement('div');
      l.setAttribute('data-mv2', 'label');
      l.setAttribute('aria-hidden', 'true'); // the pin's aria-label already carries the name
      const t = document.createElement('span');
      t.setAttribute('data-mv2', 'label-text');
      t.textContent = m.title;
      l.appendChild(t);
      root.appendChild(l);
    }

    const count = document.createElement('span');
    count.setAttribute('data-mv2', 'count');
    count.setAttribute('aria-hidden', 'true');
    root.appendChild(count);
    return root;
  }

  // Make a marker's outer element an operable control (called once, when the element is created).
  function makeOperable(wrap, onActivate) {
    wrap.classList.add('mv2-marker', 'mv2-focusable');
    wrap.setAttribute('role', 'button');
    wrap.setAttribute('tabindex', '0');
    wrap.setAttribute('aria-haspopup', 'dialog');
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); e.stopPropagation(); onActivate(); }
    });
  }

  // Start loading a pin's logo (once). Safe to call repeatedly.
  function ensureLogo(wrap) {
    const img = wrap.querySelector('[data-mv2="logo"]');
    if (img && !img.getAttribute('src')) {
      const src = img.getAttribute('data-src');
      if (src) img.setAttribute('src', src);
    }
  }

  // A pin outside the chosen category filter fades back. The attribute goes on the inner root, not the
  // marker's outer element (that one is restyled every frame of a pan).
  function applyDim(wrap, dim) {
    const pin = wrap.querySelector('.mv2-pin');
    if (pin && !!dim !== pin.hasAttribute('data-dim')) { if (dim) pin.setAttribute('data-dim', ''); else pin.removeAttribute('data-dim'); }
  }

  function applySelected(wrap, selected) {
    const pin = wrap.querySelector('.mv2-pin');
    if (pin) pin.classList.toggle('is-selected', !!selected);
    wrap.style.zIndex = selected ? '5' : '';
    wrap.setAttribute('aria-expanded', selected ? 'true' : 'false');
    if (selected) ensureLogo(wrap);
  }

  // Run when the map goes idle: "+N" badges for overlapping pins, then label collision hiding.
  // markers: Map of id -> { getElement(), _ccType, _ccId, _ccMeta } ; project(lngLat) -> {x,y}.
  function layoutOnIdle({ markers, project, selectedId, showLabels }) {
    const visible = [];
    markers.forEach((mk) => {
      const el = mk.getElement();
      if (!el || el.style.display === 'none') return;
      const p = project(mk.getLngLat());
      const meta = mk._ccMeta || {};
      visible.push({ id: mk._ccId, el, x: p.x, y: p.y, selected: mk._ccId === selectedId, nextEventAt: meta.nextEventAt, lastActivityAt: meta.lastActivityAt, title: meta.title });
    });
    // 1. overlap badges
    const heads = new Map();
    overlapGroups(visible, OVERLAP_PX).forEach((g) => heads.set(g.head.id, g.count - 1));
    visible.forEach((v) => {
      const c = v.el.querySelector('[data-mv2="count"]');
      if (!c) return;
      const n = heads.get(v.id);
      const text = n ? '+' + n : '';
      if (c.textContent !== text) c.textContent = text;
      if (!!n !== c.hasAttribute('data-on')) { if (n) c.setAttribute('data-on', ''); else c.removeAttribute('data-on'); }
    });
    // 2. label collisions (reads first, writes after: one layout pass)
    if (!showLabels) {
      visible.forEach((v) => { const l = v.el.querySelector('[data-mv2="label"]'); if (l) l.removeAttribute('data-off'); });
      return;
    }
    const rects = [];
    visible.forEach((v) => {
      const t = v.el.querySelector('[data-mv2="label-text"]');
      if (!t) return;
      const r = t.getBoundingClientRect();
      rects.push({ id: v.id, x: r.left, y: r.top, w: r.width, h: r.height, selected: v.selected, nextEventAt: v.nextEventAt, lastActivityAt: v.lastActivityAt, title: v.title });
    });
    const hide = new Set(hiddenLabels(rects, 2));
    visible.forEach((v) => {
      const l = v.el.querySelector('[data-mv2="label"]');
      if (l && hide.has(v.id) !== l.hasAttribute('data-off')) { if (hide.has(v.id)) l.setAttribute('data-off', ''); else l.removeAttribute('data-off'); }
    });
  }

  window.MapV2Pins = {
    photoShown, glyphColor, ariaLabelFor, comparePriority, overlapGroups, hiddenLabels,
    build, makeOperable, ensureLogo, applyDim, applySelected, layoutOnIdle, OVERLAP_PX,
  };
})();
