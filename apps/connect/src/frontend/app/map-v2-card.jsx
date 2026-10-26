// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Map v2 card (issue #222)
//  ------------------------------------------------------------------
//  One anatomy, six variants: text, image, video, audio, event, listing.
//  A slot is left out when its data is missing. It is never shown empty.
//
//  Category text and colour come from window.DATA.getItemCategory (the
//  `heading` and `hex` on the category). This file does not name a category
//  or a group. An event puts that line under the title; every other variant
//  puts it above the title. With no category, the `kind` label is used and
//  the dot is the muted text colour.
//
//  Video is a poster and a play disc. It never mounts a player and never
//  autoplays. Audio and video links go through UI.safeUrl. A refused URL
//  is left out. A broken picture is dropped. A listing logo falls back to
//  initials instead.
//
//  `cat` (#210) names a category GROUP (map-v2-explore.jsx): the dot and the
//  card's thin top edge then take that group's colour token (--cat-<group>)
//  instead of the category's own hex. `tile` asks for a neutral picture tile
//  with the category icon when an image card has no picture, so cards in one
//  row keep one shape.
//
//  Styles: assets/map-v2.css section 4h (tokens only). Words the card paints
//  itself live in MapV2Strings.card. Everything else is passed in.
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const { useState, useEffect } = React;
  const HEX = /^#[0-9A-Fa-f]{6}$/;

  const strings = () => (window.MapV2Strings && window.MapV2Strings.card) || {};
  const safe = (u) => (window.UI && window.UI.safeUrl ? window.UI.safeUrl(u) : '');

  function initialsOf(name) {
    return String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2)
      .map((p) => p.charAt(0)).join('').toUpperCase();
  }

  function lookupCategory(props) {
    if (props.item && window.DATA && window.DATA.getItemCategory) return window.DATA.getItemCategory(props.item) || null;
    return props.category || null;
  }

  function metaParts(meta) {
    const list = Array.isArray(meta) ? meta : (meta ? [meta] : []);
    const out = [];
    list.forEach((part) => {
      if (!part) return;
      if (typeof part === 'string') {
        const text = part.trim();
        if (text) out.push({ text: text });
      } else if (part.text && String(part.text).trim()) {
        out.push({ text: String(part.text).trim(), host: !!part.host });
      }
    });
    return out;
  }

  function categoryLine(cat, kind, slot, group) {
    const label = (cat && (cat.heading || cat.name)) || kind || '';
    if (!label) return null;
    const hex = !group && cat && cat.hex && HEX.test(cat.hex) ? cat.hex : '';
    return h('span', { 'data-mv2': slot },
      h('span', {
        'data-mv2': 'card-dot', 'aria-hidden': 'true',
        'data-cat': group || undefined,
        'data-fallback': hex || group ? undefined : '',
        style: hex ? { background: hex } : undefined,
      }),
      h('span', { 'data-mv2': 'card-chip-label' }, label));
  }

  function Picture({ src, attr, onFail }) {
    const [bad, setBad] = useState(false);
    useEffect(() => setBad(false), [src]);
    const url = safe(src);
    if (!url || bad) return null;
    return h('img', {
      src: url, alt: '', loading: 'lazy', decoding: 'async', 'data-mv2': attr,
      onError: () => { setBad(true); if (onFail) onFail(); },
    });
  }

  function mediaSlot(props, failed, setFailed, linked) {
    const variant = props.variant;
    if (variant === 'listing') {
      const url = !failed && props.media && safe(props.media.src);
      if (url) return h(Picture, { src: url, attr: 'card-logo', onFail: () => setFailed(true) });
      const letters = initialsOf(props.title);
      return letters ? h('span', { 'data-mv2': 'card-initials', 'aria-hidden': 'true' }, letters) : null;
    }
    if (failed) return tileSlot(props);
    if (variant === 'event') {
      if (!props.date || !props.date.day) return null;
      return h('span', { 'data-mv2': 'card-date', 'aria-hidden': 'true' },
        h('span', { 'data-mv2': 'card-day' }, props.date.day),
        props.date.month ? h('span', { 'data-mv2': 'card-month' }, props.date.month) : null);
    }
    if (variant === 'audio') {
      const url = props.media && safe(props.media.src);
      if (!url) return null;
      return h(Picture, { src: url, attr: 'card-art', onFail: () => setFailed(true) });
    }
    const poster = props.media && safe(props.media.src);
    if (!poster) return tileSlot(props);
    const Icon = window.Icon;
    return h('span', { 'data-mv2': 'card-media' },
      h(Picture, { src: poster, attr: 'card-photo', onFail: () => setFailed(true) }),
      variant === 'video' && linked ? h('span', { 'data-mv2': 'card-play', 'aria-hidden': 'true' },
        Icon ? h(Icon, { name: 'Play', size: 20 }) : null) : null,
      variant === 'video' && props.duration ? h('span', { 'data-mv2': 'card-duration' }, props.duration) : null);
  }

  /** A neutral 16:9 tile with the category icon, for an image card that asked for one (`tile`) and has no picture. */
  function tileSlot(props) {
    if (!props.tile || props.variant !== 'image') return null;
    const Icon = window.Icon;
    return h('span', { 'data-mv2': 'card-media', 'data-tile': '', 'data-cat': props.cat || undefined, 'aria-hidden': 'true' },
      Icon && props.tile.icon ? h(Icon, { name: props.tile.icon, size: 32 }) : null);
  }

  function actionNode(action, key) {
    if (!action || !action.label) return null;
    const href = action.href ? safe(action.href) : '';
    if (action.href && !href) return null;
    const Icon = window.Icon;
    const kids = [
      action.icon && Icon ? h(Icon, { key: 'i', name: action.icon, size: 16 }) : null,
      h('span', { key: 't' }, action.label),
    ];
    const common = { key: key, 'data-mv2': 'action' };
    if (href) return h('a', Object.assign({ href: href, target: '_blank', rel: 'noopener noreferrer' }, common), kids);
    if (!action.onClick) return null;
    return h('button', Object.assign({ type: 'button', onClick: action.onClick }, common), kids);
  }

  function Card(props) {
    const variant = props.variant || 'text';
    const [mediaFailed, setMediaFailed] = useState(false);
    const src = props.media && props.media.src;
    useEffect(() => setMediaFailed(false), [src]);

    if (props.loading) {
      const label = strings().loading;
      return h('div', {
        'data-mv2': 'card2', 'data-variant': variant, 'data-loading': '',
        'aria-busy': 'true', 'aria-label': label || undefined,
      },
        h('span', { 'data-mv2': 'card-media', 'data-skeleton': '', 'aria-hidden': 'true' }),
        h('span', { 'data-mv2': 'card-bars', 'aria-hidden': 'true' },
          h('span', { 'data-mv2': 'card-bar', 'data-skeleton': '' }),
          h('span', { 'data-mv2': 'card-bar', 'data-skeleton': '' })));
    }

    const cat = lookupCategory(props);
    const line = categoryLine(cat, props.kind, variant === 'event' ? 'card-group' : 'card-chip', props.cat);
    const parts = metaParts(props.meta);
    const liveWord = props.live ? strings().live : '';
    const prefix = props.idPrefix || 'mv2-card';
    const titleId = prefix + '-t';
    const metaId = prefix + '-m';
    const title = props.title ? String(props.title) : '';
    const excerpt = props.excerpt ? String(props.excerpt).trim() : '';
    const open = props.openState && props.openState.text
      && (props.openState.status === 'open' || props.openState.status === 'closed')
      ? props.openState : null;
    const href = props.href ? safe(props.href) : '';
    const external = variant === 'video' || variant === 'audio' || !!props.external;
    const hasMeta = parts.length > 0 || !!liveWord || !!open;

    const titleEl = title ? h('span', { id: titleId, 'data-mv2': 'row-title' }, title) : null;
    const metaKids = [];
    parts.forEach((p, i) => {
      if (i) metaKids.push(h('span', { key: 'd' + i, 'aria-hidden': 'true' }, ' · '));
      metaKids.push(h('span', { key: 'm' + i, 'data-mv2': 'row-meta', 'data-host': p.host ? '' : undefined }, p.text));
    });
    if (liveWord) {
      if (parts.length) metaKids.push(h('span', { key: 'ld', 'aria-hidden': 'true' }, ' · '));
      metaKids.push(h('span', { key: 'live', 'data-mv2': 'card-live' },
        h('span', { 'data-mv2': 'card-live-dot', 'aria-hidden': 'true' }),
        h('span', null, liveWord)));
    }
    if (open) metaKids.push(h('span', { key: 'open', 'data-mv2': 'state', 'data-status': open.status }, open.text));
    const metaEl = hasMeta ? h('span', { id: metaId, 'data-mv2': 'card-meta' }, metaKids) : null;
    const excerptEl = excerpt ? h('span', { 'data-mv2': 'card-excerpt' }, excerpt) : null;
    const moreEl = props.moreLabel ? h('span', { 'data-mv2': 'post-more' }, props.moreLabel) : null;
    const copy = h('span', { key: 'copy', 'data-mv2': 'card-copy' },
      variant === 'event' ? null : line,
      titleEl,
      variant === 'event' ? line : null,
      metaEl,
      excerptEl,
      moreEl);
    const slot = mediaSlot(props, mediaFailed, setMediaFailed, !!href);
    const media = slot ? React.cloneElement(slot, { key: 'media' }) : null;

    const listenLabel = strings().listen;
    const given = props.actions || [];
    const listen = variant === 'audio' && href && listenLabel && !given.some((a) => a && a.label === listenLabel)
      ? [{ label: listenLabel, href: href }] : [];
    const actions = given.concat(listen).map(actionNode).filter(Boolean);

    const labelled = [title ? titleId : '', hasMeta ? metaId : ''].filter(Boolean).join(' ');
    const markers = {
      'data-variant': variant,
      'data-news': props['data-news'],
      'data-near': props['data-near'],
      'aria-haspopup': props['aria-haspopup'],
      'aria-current': props['aria-current'],
      'data-cat': props.cat || undefined,
    };
    const control = Object.assign({}, markers, {
      'aria-labelledby': labelled || undefined,
    });
    if (href) {
      control.href = href;
      if (external) { control.target = '_blank'; control.rel = 'noopener noreferrer'; }
    } else if (props.onClick) {
      control.type = 'button';
      control.onClick = props.onClick;
    }

    const interactive = !!(href || props.onClick);
    const tag = href ? 'a' : (props.onClick ? 'button' : 'div');
    const body = [media, copy];

    if (actions.length) {
      const tap = interactive
        ? h(tag, Object.assign({ 'data-mv2': 'card-tap' }, control), body)
        : h('div', { 'data-mv2': 'card-tap', 'data-variant': variant }, body);
      return h('div', Object.assign({
        'data-mv2': 'card2', 'data-variant': variant, 'data-split': '',
      }, markers), tap, h('div', { 'data-mv2': 'card-actions' }, actions));
    }

    if (!interactive) {
      return h('div', { 'data-mv2': 'card2', 'data-variant': variant }, body);
    }
    return h(tag, Object.assign({ 'data-mv2': 'card2' }, control), body);
  }

  window.MapV2Card = Card;
})();
