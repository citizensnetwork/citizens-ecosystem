// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Map v2 news reader (issue #216)
//  ------------------------------------------------------------------
//  Tapping a news card opens ONE centred dialog, the same on the map sheet
//  and on a Contributor's profile. It is not a second bottom sheet: a sheet
//  on top of the map sheet would fight the sheet's drag and snap.
//
//  The dialog is portalled to <body> (a position:fixed box inside the sheet
//  would be fixed to the sheet's own transform). Back goes through
//  useBackGuard, so the sheet underneath is still one more Back away.
//  Styles: assets/map-v2.css section 4f (tokens only). Text: MapV2Strings.sheet.news.
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const { useState, useEffect, useRef } = React;
  const useBackGuard = window.useBackGuard || function () {};

  // A bare https URL becomes a link. Trailing punctuation stays in the sentence.
  // Anything safeUrl refuses, and every other scheme, stays plain text. Never HTML.
  function linkify(text) {
    const raw = String(text || '');
    const re = /(https:\/\/[^\s<>"]+)/g;
    const out = [];
    let last = 0;
    let m;
    let n = 0;
    while ((m = re.exec(raw))) {
      const start = m.index;
      let url = m[1];
      let trail = '';
      const tail = /[.,;:!?)]+$/.exec(url);
      if (tail) {
        trail = tail[0];
        url = url.slice(0, -trail.length);
      }
      if (start > last) out.push(raw.slice(last, start));
      const safe = window.UI && window.UI.safeUrl(url);
      if (safe) {
        out.push(h('a', {
          key: 'l' + n,
          href: safe,
          'data-mv2': 'news-link',
          target: '_blank',
          rel: 'noopener noreferrer',
        }, url));
        if (trail) out.push(trail);
      } else {
        out.push(url + trail);
      }
      n += 1;
      last = start + m[1].length;
    }
    if (last < raw.length) out.push(raw.slice(last));
    return out;
  }

  // Elements a Tab key can land on. The title is tabindex="-1" on purpose, so it
  // is focused when the dialog opens and then left out of the cycle.
  function tabbables(root) {
    return Array.prototype.slice.call(root.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ));
  }

  function Reader({ post, sourceName, strings, onClose, returnFocus }) {
    const card = useRef(null);
    const titleRef = useRef(null);
    const pressRef = useRef(null);
    const closeRef = useRef(onClose);
    closeRef.current = onClose;
    const [imgFailed, setImgFailed] = useState(false);
    useBackGuard(true, onClose);

    useEffect(() => { setImgFailed(false); }, [post && post.id, post && post.image]);

    useEffect(() => {
      const root = document.getElementById('root');
      // jsdom's unset inert reads as undefined; a browser reads false. Coerce so
      // the restore writes a real boolean and the page behind the card is usable.
      const prevInert = !!(root && root.inert);
      if (root) root.inert = true;
      const prevOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      if (titleRef.current) titleRef.current.focus({ preventScroll: true });
      return () => {
        // The opening card sits inside #root. Lift inert before returning focus,
        // or the browser refuses to focus an inert button.
        if (root) root.inert = prevInert;
        document.documentElement.style.overflow = prevOverflow;
        if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
      };
    }, []);

    useEffect(() => {
      const onKey = (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          e.preventDefault();
          closeRef.current();
          return;
        }
        if (e.key !== 'Tab' || !card.current) return;
        const nodes = tabbables(card.current);
        if (!nodes.length) { e.preventDefault(); e.stopPropagation(); return; }
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        const active = document.activeElement;
        const inside = card.current.contains(active);
        const idx = nodes.indexOf(active);
        // The title is inside the card but not tabbable. Tab from it reaches the
        // close button (which sits above the title in the DOM), then the links.
        if (e.shiftKey) {
          if (!inside || idx <= 0) { e.preventDefault(); e.stopPropagation(); last.focus(); }
        } else if (!inside || idx === -1 || idx === nodes.length - 1) {
          e.preventDefault();
          e.stopPropagation();
          first.focus();
        }
      };
      document.addEventListener('keydown', onKey, true);
      return () => document.removeEventListener('keydown', onKey, true);
    }, []);

    if (!post) return null;
    const imgSrc = !imgFailed && post.image && window.UI && window.UI.safeUrl(post.image);
    const ago = window.MapV2Time ? window.MapV2Time.postedAgo(post.createdAt || post.date, Date.now()) : '';
    const body = post.body ? String(post.body) : '';
    return h('div', {
      'data-mv2': 'news',
      // A press here must not reach the sheet's onPointerDown. React portals bubble
      // synthetic events, so without this a press on the scrim starts a sheet drag.
      // A drag that ends on the scrim still synthesises a click; ignore that click
      // so only a tap, not a drag, dismisses the reader.
      onPointerDown: (e) => {
        e.stopPropagation();
        pressRef.current = { x: e.clientX, y: e.clientY, moved: false };
      },
      onPointerMove: (e) => {
        const p = pressRef.current;
        if (!p) return;
        if (Math.abs(e.clientX - p.x) > 8 || Math.abs(e.clientY - p.y) > 8) p.moved = true;
      },
      onClick: (e) => {
        if (e.target !== e.currentTarget) return;
        if (pressRef.current && pressRef.current.moved) return;
        closeRef.current();
      },
    },
      h('div', {
        ref: card, 'data-mv2': 'news-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'mv2-news-title',
      },
        h('div', { 'data-mv2': 'news-head' },
          h('p', { 'data-mv2': 'news-from' }, sourceName || ''),
          h('button', {
            type: 'button', 'data-mv2': 'icon-btn', 'aria-label': strings.close, onClick: () => closeRef.current(),
          }, h(window.Icon, { name: 'X', size: 20 }))),
        h('div', { 'data-mv2': 'news-scroll' },
          imgSrc && h('img', {
            src: imgSrc, alt: '', 'data-mv2': 'news-img', decoding: 'async',
            onError: () => setImgFailed(true),
          }),
          h('h2', { id: 'mv2-news-title', ref: titleRef, tabIndex: -1, 'data-mv2': 'news-title' }, post.title || ''),
          ago && h('p', { 'data-mv2': 'news-meta' }, h('time', { dateTime: post.date || undefined }, ago)),
          body && h('div', { 'data-mv2': 'news-body' }, linkify(body)))));
  }

  window.MapV2News = { Reader, linkify };
})();
