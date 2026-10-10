// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Map v2 gallery (tracker P1-09): a 3-column grid of the
//  Contributor's OWN photos and a viewer that shows one uncropped.
//  ------------------------------------------------------------------
//  · Only images the contributor supplied (founder D5): their cover photos and
//    gallery images. Nothing is imported from another site or a social network,
//    and the CSP (`img-src`) would not draw one anyway.
//  · Tiles reserve their space with an aspect-ratio (CLS 0), load lazily and
//    decode off the main thread; at most TILE_LIMIT tiles are in the page until
//    the person asks for more (no endless scroll, tracker Q4).
//  · The viewer is a labelled dialog: arrows, swipe, Escape and Back all close or
//    step it. Back goes through useBackGuard like every overlay, so the sheet
//    underneath is still one more Back away (guards unwind last-in first-out).
//  Styles: assets/map-v2.css (tokens only). Text: MapV2Strings.gallery.
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const { useState, useEffect, useRef } = React;
  const useBackGuard = window.useBackGuard || function () {};
  const TILE_LIMIT = 12;      // tiles in the page before "Show more"; also the cap on first-scroll image requests
  const SWIPE_PX = 48;        // horizontal travel that counts as a swipe

  // images: [{ url, caption }]
  function Grid({ images, onOpen, strings }) {
    const [all, setAll] = useState(false);
    const shown = all ? images : images.slice(0, TILE_LIMIT);
    return h('div', null,
      h('ul', { 'data-mv2': 'grid', role: 'list' },
        shown.map((im, i) => h('li', { key: im.url + i, 'data-mv2': 'tile' },
          h('button', {
            type: 'button', 'data-mv2': 'tile-btn',
            'aria-label': strings.photoOf(i + 1, images.length) + (im.caption ? ': ' + im.caption : ''),
            onClick: (e) => onOpen(i, e.currentTarget),
          },
            h('img', { src: im.url, alt: '', loading: 'lazy', decoding: 'async', 'data-mv2': 'tile-img' }))))),
      !all && images.length > TILE_LIMIT && h('button', {
        type: 'button', 'data-mv2': 'more', onClick: () => setAll(true),
      }, strings.showAll(images.length)));
  }

  // A grid-shaped skeleton: the same boxes, so nothing moves when the photos arrive.
  function GridSkeleton({ count = 6, label }) {
    return h('div', { 'data-mv2': 'grid', role: 'status', 'aria-label': label },
      Array.from({ length: count }, (_, i) => h('div', { key: i, 'data-mv2': 'tile', 'data-skeleton': '' })));
  }

  function Viewer({ images, index, onClose, onIndex, strings, returnFocus }) {
    const stage = useRef(null);
    const closeBtn = useRef(null);
    const drag = useRef(null);
    useBackGuard(true, onClose);
    useEffect(() => {
      if (closeBtn.current) closeBtn.current.focus({ preventScroll: true });
      return () => { if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true }); };
    }, []);
    const n = images.length;
    const step = (d) => onIndex((index + d + n) % n);
    useEffect(() => {
      const onKey = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
        else if (e.key === 'ArrowRight' && n > 1) { e.stopPropagation(); step(1); }
        else if (e.key === 'ArrowLeft' && n > 1) { e.stopPropagation(); step(-1); }
      };
      // capture, so the sheet's own Escape handler (bubble phase) never sees this key
      document.addEventListener('keydown', onKey, true);
      return () => document.removeEventListener('keydown', onKey, true);
    }); // re-bound every render: `index` changes
    const im = images[index];
    const down = (e) => { drag.current = { x: e.clientX, y: e.clientY }; };
    const up = (e) => {
      const d = drag.current; drag.current = null;
      if (!d || n < 2) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
    };
    return h('div', { 'data-mv2': 'viewer', role: 'dialog', 'aria-modal': 'true', 'aria-label': strings.viewerLabel(index + 1, n) },
      h('div', { 'data-mv2': 'viewer-stage', ref: stage, onPointerDown: down, onPointerUp: up, onPointerCancel: () => { drag.current = null; } },
        h('img', { src: im.url, alt: im.caption || '', 'data-mv2': 'viewer-img', decoding: 'async', draggable: false })),
      im.caption && h('p', { 'data-mv2': 'viewer-caption' }, im.caption),
      h('button', { type: 'button', ref: closeBtn, 'data-mv2': 'viewer-close', 'aria-label': strings.closePhoto, onClick: onClose }, '×'),
      n > 1 && h('button', { type: 'button', 'data-mv2': 'viewer-prev', 'aria-label': strings.prevPhoto, onClick: () => step(-1) }, '‹'),
      n > 1 && h('button', { type: 'button', 'data-mv2': 'viewer-next', 'aria-label': strings.nextPhoto, onClick: () => step(1) }, '›'),
      n > 1 && h('p', { 'data-mv2': 'viewer-count', 'aria-hidden': 'true' }, (index + 1) + ' / ' + n));
  }

  window.MapV2Gallery = { Grid, GridSkeleton, Viewer, TILE_LIMIT, SWIPE_PX };
})();
