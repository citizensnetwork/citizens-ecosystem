// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Discover (map home) + Impact Idea preview panel
// ════════════════════════════════════════════════════════════════════
(function () {
  const { useState, useRef, useMemo, useCallback, useEffect } = React;
  const { CategoryBadge, Button } = window.UI;
  const Icon = window.Icon;
  const useBackGuard = window.useBackGuard || function () {};

  // ── Impact Idea preview (on pin click) ──
  //  A Contributor, a Place and an Event open the Map v2 bottom sheet (map-v2-sheet.jsx). Impact Ideas
  //  are not listings — they have no organiser, no category profile page and no socials — so they keep
  //  this small panel.
  function IdeaPanel({ id, onClose }) {
    const app = window.useApp();
    // A Back press dismisses the pin preview before it leaves the map —
    // the same expectation a native map app sets.
    useBackGuard(true, onClose);
    const { ideas, toggleIdeaVote } = app;
    const item = ideas.find((i) => i.id === id);
    if (!item) return null;

    const cat = window.DATA.getCategory(item.category);
    const pct = Math.min(100, Math.round((item.votes / item.threshold) * 100));

    return Wrapper(
      React.createElement('div', { className: 'p-4' },
        React.createElement('div', { className: 'flex items-center gap-2 mb-2' },
          React.createElement('span', { className: 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent text-gold-dark flex items-center gap-1' }, React.createElement(Icon, { name: 'Lightbulb', size: 10 }), 'Impact Idea'),
          cat && React.createElement(CategoryBadge, { cat })),
        React.createElement('h3', { className: 'text-lg text-foreground leading-tight mb-1' }, item.title),
        React.createElement('p', { className: 'text-xs text-muted-foreground leading-relaxed line-clamp-3 mb-3' }, item.description),
        React.createElement('div', { className: 'flex items-center justify-between mb-1' },
          React.createElement('span', { className: 'text-xs font-bold text-foreground' }, item.votes.toLocaleString() + ' votes'),
          React.createElement('span', { className: 'text-[10px] text-muted-foreground' }, 'Goal ' + item.threshold.toLocaleString())),
        React.createElement('div', { className: 'h-2 rounded-full bg-muted overflow-hidden mb-3' },
          React.createElement('div', { className: 'h-full gold-gradient rounded-full', style: { width: pct + '%' } })),
        React.createElement('div', { className: 'flex gap-2' },
          React.createElement(Button, { variant: item.votedByMe ? 'success' : 'gold', className: 'flex-1', icon: item.votedByMe ? 'Check' : 'Heart', onClick: () => toggleIdeaVote(item.id) }, item.votedByMe ? 'Voted — tap to undo' : 'Collaborate'),
          React.createElement(Button, { variant: 'outline', icon: 'X', onClick: onClose }, 'Dismiss'))));

    function Wrapper(children) {
      return React.createElement('div', {
        className: 'fixed z-[120] left-0 right-0 bottom-16 md:bottom-4 md:left-[280px] md:right-auto md:w-[370px]',
      },
        React.createElement('div', {
          className: 'shadow-2xl rounded-t-3xl md:rounded-3xl overflow-hidden md:max-h-none max-h-[78vh] overflow-y-auto bg-white',
        }, children));
    }
  }

  function decorateForV2(markers, events, newsPosts, now) {
    const ms = (v) => { const t = v ? Date.parse(v) : NaN; return Number.isNaN(t) ? undefined : t; };
    const byOrg = Object.create(null);
    const byEvent = Object.create(null);
    const bump = (id, key, t, pick) => { if (t === undefined || !id) return; const o = byOrg[id] || (byOrg[id] = {}); o[key] = o[key] === undefined ? t : pick(o[key], t); };
    events.forEach((e) => {
      const start = ms(e.startsAt);
      byEvent[e.id] = { next: start, last: ms(e.createdAt) };
      if (!window.DATA.isPastEvent(e, now)) bump(e.organizerId, 'next', start, Math.min);
      bump(e.organizerId, 'last', ms(e.createdAt), Math.max);
    });
    newsPosts.forEach((n) => bump(n.contributorId, 'last', ms(n.createdAt) || ms(n.date), Math.max));
    markers.forEach((m) => {
      if (m.type === 'contributor' && byOrg[m.id]) { m.nextEventAt = byOrg[m.id].next; m.lastActivityAt = byOrg[m.id].last; }
      else if (m.type === 'event' && byEvent[m.id]) { m.nextEventAt = byEvent[m.id].next; m.lastActivityAt = byEvent[m.id].last; }
    });
  }

  const CARD_ZOOM = 14;     // a card never lands on a map zoomed out further than this: the pin has to be seen
  // Where to… (founder, 2026-11-25) keeps its distance, so every option stays in view: a first tap on a card or a pin only
  // chooses it, a second zooms all the way in to that pin (its name and photo show from 15), a third opens it.
  const WHERE_TO_ZOOM = 16.5;
  // A Where to… tile or a row in focus shows its town, not its province (founder, 2026-11-17): every pin is drawn from 9.5.
  const TOWN_ZOOM = 11;
  // Pins kept for a Where-to / section focus: metro-scale around the camera town (founder, 2026-11-23).
  const TOWN_RADIUS_M = 40000;
  // The crown's reset lands on the person's own place at suburb zoom.
  const HOME_ZOOM = 12.5;

  // ── Home / Discover ──
  function HomePage() {
    const app = window.useApp();
    const { events, places, contributors, ideas, newsPosts, dismissBubble, trackImpression } = app;
    const [selected, setSelected] = useState(null);
    // The sheet reports how much of the map it covers; the map keeps the selected pin clear of it
    const mapApi = useRef(null);
    const [selType, setSelType] = useState('event');
    const [showIdeas, setShowIdeas] = useState(false);
    const [query, setQuery] = useState('');
    const [searchOpen, setSearchOpen] = useState(false);
    const [group, setGroup] = useState('');
    const [litId, setLitId] = useState(null);
    // Which entity types the current zoom is showing ('all' | 'places' |
    // 'none' — see map.jsx zoomBandFor). The map owns the
    // thresholds and only reports when the band actually changes, so this is
    // one state update per crossing, not one per zoom frame.
    const [zoomBand, setZoomBand] = useState('all');
    // Map v2 (#210): the pill (a group, Events or All: chosen inside the Explore panel), the listing whose full sheet is
    // open (a chosen card was tapped AGAIN; the first tap only chooses it and moves the map), whether the panel is
    // lowered to its title strip, and which pin was just tapped (so the panel brings that card into view; a card tap
    // never does, the panel stays exactly where it is).
    const X = window.MapV2Explore;
    // What the Explore panel has in focus (founder, 2026-11-17): { kind: 'tile', id } for a Where to… tile, { kind: 'sec', id }
    // for one of its rows (Near and Now…, New on Connect…), or null. It filters the pins, and the chip at the top clears it.
    // Ideas ride their own tile.
    const [focus, setFocus] = useState(null);
    const [secIds, setSecIds] = useState([]);
    const [sheet, setSheet] = useState(null);
    const [panelOpen, setPanelOpen] = useState(false);
    const [reveal, setReveal] = useState(null);   // { id, focus, n }: n counts pin taps, so a keyboard pin brings its card into the sheet
    const rootRef = useRef(null);
    const skipFrame = useRef(false);
    // The map home's levels (founder, 2026-11-18). 0: the crown alone. 1: the search bar open, with its row of category
    // chips (searchOpen). 2: a pin tapped, its card and its neighbours in the pin carousel at the foot (peek). 3: the chosen
    // card tapped again, the carousel raised with that card's details below it (peek.raised). Each level is ONE history
    // entry (useBackGuard below), so the phone's Back, the browser's Back, the carousel's Back and a pull down all step
    // back one level, and each level keeps what it was entered with (the camera, the card) so Back puts it all back. The
    // crown, the carousel's Close and a tap on empty map go straight to level 0 and take every entry off at once.
    // peek: { ids (the cards, in order), index, camera + view (as level 2 was entered), raised, raisedAt ({ index, camera }
    // as level 3 was entered), focusCard (a counter: a pin chosen from the keyboard takes focus into the cards) }
    const [peek, setPeek] = useState(null);
    const peekRef = useRef(null);
    peekRef.current = peek;
    const [exploreMode, setExploreMode] = useState('rest');
    const press = useRef(null);       // where a press on the map began: a pan is not a tap on empty map
    const [restSignal, setRestSignal] = useState(0);   // a tap on empty map: the Explore panel goes back to its rest too
    const [stripSignal, setStripSignal] = useState(0); // close-search: reopen Where-to strip under the crown
    const chosen = useRef({ id: null, type: null });
    const narrow = X.useNarrow();
    const clean = !!(app.nav && app.nav.params && app.nav.params.view === 'map');
    const XS = window.MapV2Strings.explore;
    const tile = focus && focus.kind === 'tile' ? focus.id : null;
    const tileRec = tile && X.tileOf ? X.tileOf(tile) : null;
    const secKey = focus && focus.kind === 'sec' ? secIds.join('|') : '';
    const focusKey = focus ? focus.kind + ':' + focus.id : '';
    const focusRef = useRef(focus);
    focusRef.current = focus;
    // Camera town for the active Where-to / section focus. Captured synchronously on focusKey change
    // so the pin filter and the survey share the same town on the first paint (founder, 2026-11-23).
    const townHold = useRef({ key: '', town: null });
    if (townHold.current.key !== focusKey) {
      townHold.current.key = focusKey;
      if (!focusKey || !(focus && (focus.kind === 'tile' || focus.kind === 'sec'))) {
        townHold.current.town = null;
      } else {
        const api = mapApi.current;
        const cam = api && api.camera ? api.camera() : null;
        if (cam && Number.isFinite(cam.lat) && Number.isFinite(cam.lng)) {
          townHold.current.town = { lat: cam.lat, lng: cam.lng, zoom: cam.zoom };
        } else {
          const v = api && api.view ? api.view() : null;
          townHold.current.town = v && v.centre ? { lat: v.centre.lat, lng: v.centre.lng } : null;
        }
      }
    }
    const town = townHold.current.town;
    const focusTest = useMemo(() => {
      if (tileRec && !tileRec.ideas && X.tileMatches) return (m) => X.tileMatches(tile, m);
      if (secKey) { const set = new Set(secKey.split('|')); return (m) => set.has(m.id); }
      return null;
    }, [X, tile, tileRec, secKey]);
    const pinFilter = useMemo(() => {
      if (!focusTest && !group) return null;
      const near = window.MapV2Nearby;
      const inTown = (m) => {
        if (!town || !near || !near.metersBetween) return true;
        if (typeof m.lat !== 'number' || typeof m.lng !== 'number') return false;
        return near.metersBetween(town, m) <= TOWN_RADIUS_M;
      };
      // Town radius only while the live camera is at/above town scale — zooming out to find more
      // matches must not keep the 40 km clamp (founder, 2026-11-23).
      const focusTown = !!(focus && (focus.kind === 'tile' || focus.kind === 'sec') && town);
      return (m) => {
        if (focusTest && !focusTest(m)) return false;
        if (group && !(X.groupOf && X.groupOf(m) === group)) return false;
        if (!focusTown) return true;
        const cam = mapApi.current && mapApi.current.camera ? mapApi.current.camera() : null;
        const z = cam && Number.isFinite(cam.zoom) ? cam.zoom
          : (Number.isFinite(town.zoom) ? town.zoom : TOWN_ZOOM);
        if (z < TOWN_ZOOM) return true;
        return inTown(m);
      };
    }, [focusTest, group, X, focus, town]);
    // Where to… / section: if zoomed IN closer than town, zoom OUT to town (same centre, no pan).
    // At town or further out: leave the camera alone so the person can zoom out to find matches
    // without every tile tap yanking them back (founder, 2026-11-23).
    useEffect(() => {
      setShowIdeas(!!(tileRec && tileRec.ideas));
      if (!focusKey || !town) return;
      if (!(focus && (focus.kind === 'tile' || focus.kind === 'sec'))) return;
      const api = mapApi.current;
      if (!api || !api.survey) return;
      skipFrame.current = true;
      const camNow = api.camera ? api.camera() : null;
      const zNow = camNow && Number.isFinite(camNow.zoom) ? camNow.zoom
        : (Number.isFinite(town.zoom) ? town.zoom : TOWN_ZOOM);
      if (zNow <= TOWN_ZOOM) return;
      api.survey(town.lat, town.lng, TOWN_ZOOM, { lift: false });
    }, [focusKey, town]);
    // How much room the panel takes is the stylesheet's job (--explore-h follows the panel's look, map-v2.css Pack 08), so it is
    // right even when the CSS arrives after the first render. This only frames the data again as the panel takes room, but
    // never because the person lowered or raised it (the map would jump), and never under an active Where to… focus.
    const onExploreHeight = useCallback((px) => {
      if (!rootRef.current || !(px > 0)) return;
      if (skipFrame.current) { skipFrame.current = false; return; }
      if (focusRef.current) return;
      if (mapApi.current && mapApi.current.reframe) mapApi.current.reframe();
    }, []);
    // Lower or raise the panel (the handle, or a pin tap that needs its card). Only a real change skips the next framing.
    const onPanel = useCallback((isOpen) => {
      setPanelOpen(!!isOpen);
    }, []);

    const q = query.trim().toLowerCase();
    const matches = (t) => !q || (t.title || t.name || '').toLowerCase().includes(q) || (t.organizerName || '').toLowerCase().includes(q);
    // Owner display name from the contributors already loaded. No new request. Blank when the owner isn't in that list.
    const ownerName = (id, fallback) => {
      const row = id && contributors.find((c) => c.id === id);
      return (row && row.name) || fallback || '';
    };
    const now = Date.now();
    const markers = [
      // A finished event is history, not a place to turn up: it leaves the map
      // (it stays on its organiser's profile and dashboard, under "Past events").
      ...events.filter((e) => !window.DATA.isPastEvent(e, now)).filter(matches).map((e) => ({ id: e.id, type: 'event', title: e.title, category: e.category, lat: e.lat, lng: e.lng, mapX: e.mapX, mapY: e.mapY, isLive: e.isLive, isBusy: e.isBusy, broadcast: e.broadcast, coverPhoto: e.coverPhoto, startsAt: e.startsAt, endsAt: e.endsAt, createdAt: e.createdAt, location: e.location, address: e.address, ownerName: ownerName(e.organizerId, e.organizerName) })),
      ...places.filter(matches).map((p) => ({ id: p.id, type: 'place', title: p.name, category: p.category, lat: p.lat, lng: p.lng, mapX: p.mapX, mapY: p.mapY, broadcast: p.broadcast, coverPhoto: p.coverPhoto, openHours: p.openHours, createdAt: p.createdAt, location: p.location, address: p.address, ownerName: ownerName(p.organizerId, p.organizerName) })),
      ...(showIdeas ? ideas.filter((i) => i.status === 'voting' && (i.lat != null || i.mapX != null)).map((i) => ({ id: i.id, type: 'idea', title: i.title, category: i.category, lat: i.lat, lng: i.lng, mapX: i.mapX, mapY: i.mapY, createdAt: i.createdAt })) : []),
    ];
    // What decides which pin keeps its name label when two collide, and who heads a "+N" group:
    // an upcoming event first (soonest), then the most recent activity, then the name. Never popularity.
    decorateForV2(markers, events, newsPosts || [], now);

    const rowMarkers = markers.filter((m) => m.type !== 'idea');
    const byId = new Map(rowMarkers.map((m) => [m.id, m]));
    const sources = useMemo(() => ({ events, places, contributors }), [events, places, contributors]);

    // ── the levels ──
    const camera = () => (mapApi.current && mapApi.current.camera ? mapApi.current.camera() : null);
    const putCamera = (c) => { if (c && mapApi.current && mapApi.current.setCamera) mapApi.current.setCamera(c); };
    const choose = (id) => {
      const m = byId.get(id);
      setSelected(m ? id : null); if (m) setSelType(m.type); setLitId(null);
    };
    // Soft-centre between search and the RAISED peek top (pinpeek's full height), not the lowered
    // peek/crown — so from crown-only the pin sits clear of the crown (founder, 2026-11-23).
    // --pp-full / --pp-peek are calc() tokens: parseFloat is NaN; measure the element instead.
    // Raised, the carousel covers the map: nothing to bring into view.
    const revealChosen = (id) => {
      const home = rootRef.current;
      const api = mapApi.current;
      if (!home || !api || !api.revealSelected || (peekRef.current && peekRef.current.raised)) return;
      // Double rAF: peek may still be mounting when openPeek runs from crown-only rest.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!mapApi.current || !mapApi.current.revealSelected) return;
        if (peekRef.current && peekRef.current.raised) return;
        const peekEl = home.querySelector && home.querySelector("[data-mv2='pinpeek']:not([hidden])");
        // pinpeek's layout height is always --pp-full; translateY only slides the lowered peek.
        let foot = peekEl ? (peekEl.offsetHeight || 0) : 0;
        if (!(foot > 0)) {
          const cs = window.getComputedStyle(home);
          const hit = parseFloat(cs.getPropertyValue('--hit')) || 48;
          const gap = parseFloat(cs.getPropertyValue('--space-7')) || 28;
          foot = Math.max(0, (home.clientHeight || 0) - hit - gap);
        }
        mapApi.current.revealSelected(foot, id);
      }));
    };
    // Level 2 (or 3 when raised): pin or Explore 2nd tap. Carousel among province pool; pin snapped into the
    // search↔drawer mid-band (revealChosen). Raised = same drawer chrome as pin 2nd tap (founder, 2026-11-22).
    const openPeek = (id, t, byKey, opts) => {
      const m = byId.get(id);
      if (!m) return;
      const raised = !!(opts && opts.raised);
      setSheet(null); choose(id);
      const cur = peekRef.current;
      const at = cur ? cur.ids.indexOf(id) : -1;
      if (cur && at !== -1) {
        setPeek(Object.assign({}, cur, {
          index: at, focusCard: byKey ? cur.focusCard + 1 : cur.focusCard,
          raised: raised || cur.raised,
          raisedAt: raised ? { index: at, camera: camera() } : cur.raisedAt,
        }));
        if (!(raised || cur.raised)) revealChosen(id);
        return;
      }
      const api = mapApi.current;
      const pool = pinFilter ? rowMarkers.filter((x) => x.id === id || pinFilter(x)) : rowMarkers;
      const ordered = X.peekOrder(m, pool, null, pool.length);
      const ids = ordered.map((x) => x.id);
      const index = Math.max(0, ids.indexOf(id));
      const cam = camera();
      const view = (cur && cur.view) || (api && api.view ? api.view() : null);
      const entryCam = cur ? cur.camera : cam;
      if (cur) {
        setPeek(Object.assign({}, cur, {
          ids, index, focusCard: byKey ? cur.focusCard + 1 : cur.focusCard,
          raised: raised, raisedAt: raised ? { index: index, camera: cam } : null,
        }));
        if (!raised) revealChosen(id);
        return;
      }
      setPeek({
        ids, index, camera: entryCam, view: view,
        raised: raised, raisedAt: raised ? { index: index, camera: cam } : null,
        focusCard: byKey ? 1 : 0,
      });
      if (!raised) revealChosen(id);
    };
    // Explore's location menu and a tile. The map may be unmounted when the
    // person chooses them, so each one is stored and applied once home is back.
    useEffect(() => {
      const fly = (city) => {
        const api = mapApi.current;
        if (!city || !Number.isFinite(city.lat) || !Number.isFinite(city.lng) || !api || !api.survey) return false;
        api.survey(city.lat, city.lng, 11, { lift: false });
        return true;
      };
      const openStored = (id, type) => {
        if (!id || !byId.get(id)) return false;
        openPeek(id, type || byId.get(id).type, false, null);
        return true;
      };
      const takeArea = () => {
        let city = null;
        try { city = JSON.parse(sessionStorage.getItem('cc_area_pending') || 'null'); } catch (e) { city = null; }
        if (!city || !fly(city)) return;
        try { sessionStorage.removeItem('cc_area_pending'); } catch (e) { /* private mode */ }
      };
      const takePick = (id) => {
        const itemId = id || '';
        let stored = itemId;
        if (!stored) { try { stored = sessionStorage.getItem('cc_explore_pick') || ''; } catch (e) { stored = ''; } }
        if (!stored || !openStored(stored)) return;
        try { sessionStorage.removeItem('cc_explore_pick'); } catch (e) { /* private mode */ }
      };
      const onArea = (e) => { if (fly(e.detail)) { try { sessionStorage.removeItem('cc_area_pending'); } catch (err) { /* private mode */ } } };
      const onPick = (e) => takePick(e.detail && e.detail.id);
      takeArea();
      takePick('');
      window.addEventListener('cc-set-area', onArea);
      window.addEventListener('cc-explore-pick', onPick);
      return () => {
        window.removeEventListener('cc-set-area', onArea);
        window.removeEventListener('cc-explore-pick', onPick);
      };
    });
    const peekTo = (i) => {
      const cur = peekRef.current;
      if (!cur || !cur.ids[i]) return;
      const nextId = cur.ids[i];
      setPeek(Object.assign({}, cur, { index: i }));
      choose(nextId);
      revealChosen(nextId);
    };
    // Level 3: the chosen card tapped again (or the carousel pulled up).
    const raisePeek = () => {
      const cur = peekRef.current;
      if (!cur || cur.raised) return;
      setPeek(Object.assign({}, cur, { raised: true, raisedAt: { index: cur.index, camera: camera() } }));
    };
    // Card tap 3: close the preview (no zoom change) and centre the pin on screen — panel is gone (founder, 2026-11-23).
    const divePeek = (id) => {
      const cur = peekRef.current;
      if (!cur) return;
      const target = id || (cur.ids && cur.ids[cur.index]);
      setPeek(null);
      if (target) choose(target);
      if (target && mapApi.current && mapApi.current.centreOnScreen) {
        mapApi.current.centreOnScreen(target);
      }
    };
    // Back from level 3: the cards again, on the card and the map the details were opened from.
    const lowerPeek = () => {
      const cur = peekRef.current;
      if (!cur || !cur.raised) return;
      const at = cur.raisedAt || { index: cur.index, camera: null };
      setPeek(Object.assign({}, cur, { raised: false, raisedAt: null, index: at.index }));
      choose(cur.ids[at.index]);
      putCamera(at.camera);
    };
    // Back from level 2: the carousel closes, nothing is chosen, and the map goes back to where the pin was tapped.
    const closePeek = () => {
      const cur = peekRef.current;
      if (!cur) return;
      // Close goes home: clear the drawer and any search chips under it (Back still steps one level).
      setPeek(null); setSelected(null); setLitId(null); setSearchOpen(false);
      putCamera(cur.camera);
    };
    const peekBack = () => { const cur = peekRef.current; if (cur && cur.raised) lowerPeek(); else closePeek(); };
    // Level 0 from anywhere: empty-map tap. Filter chip stays. Crown with a filter on clears via resetHome.
    const resetLevels = () => { setPeek(null); setSearchOpen(false); setSelected(null); setLitId(null); setSheet(null); };
    // Handle / crown tap: step down one level (raised → cards → closed). Founder option B, 2026-11-22.
    const stepLevels = () => {
      if (peekRef.current) { peekBack(); return; }
      if (searchOpen) { closeSearch(); return; }
      resetLevels();
    };
    // X / Back from search: close completely and bring back the crown + Where-to strip (founder, 2026-11-22).
    const closeSearch = () => {
      setSearchOpen(false);
      setQuery('');
      setStripSignal((n) => n + 1);
    };
    useBackGuard(searchOpen, closeSearch);
    // One history entry per level: raised Back/Escape steps down; cards-only Back closes (handle tap still uses peekBack).
    useBackGuard(!!peek, closePeek);
    useBackGuard(!!(peek && peek.raised), lowerPeek);
    const peekItems = peek ? peek.ids.map((id) => byId.get(id)).filter(Boolean) : [];
    // Words typed into the search can take every card's listing off the map: the carousel then has nothing to show, so it
    // steps back as Back would.
    const peekEmpty = !!peek && peekItems.length === 0;
    useEffect(() => { if (peekEmpty) closePeek(); }, [peekEmpty]);
    // When the carousel closes with focus inside it, focus goes back to the pin it was opened for (else the Search button).
    const peekReturn = (id) => {
      const home = rootRef.current;
      if (!home) return;
      const pins = id ? Array.prototype.slice.call(home.querySelectorAll('.maplibregl-marker[data-cc-id]')) : [];
      const pin = pins.find((el) => el.getAttribute('data-cc-id') === String(id));
      const target = pin || home.querySelector("[data-mv2='home-find']");
      if (target && target.focus) target.focus({ preventScroll: true });
    };

    // #210: where the map is looking as the sheet opens, so its distance says what the card said (the map moves under the sheet)
    const openSheet = (id, t, from) => {
      const view = from || (mapApi.current && mapApi.current.view ? mapApi.current.view() : null);
      // A Contributor (reached by a place's or an event's owner line) has no pin and no card: the listing that led there
      // stays the chosen one, so closing the sheet comes back to that card, still outlined.
      if (t !== 'contributor') { setSelected(id); setSelType(t); }
      // Full sheet replaces the raised pinpeek (do not leave a hidden inline sheet with the same hooks in the DOM).
      setPeek(null);
      setSheet({ id, type: t, view }); if (t === 'event') trackImpression(id);
    };
    const closeSheet = () => setSheet(null);
    // The first tap on a card CHOOSES it: it keeps its place in the panel (outlined, "Tap again to open"), and the map
    // eases to its pin, clear of the search bar above and the panel below. The second tap on the chosen card opens the
    // full listing; closing that returns to this very panel and map (the map never moved for it).
    chosen.current = { id: selected, type: selType };
    // A card's first tap chooses it and lifts the pin; the second tap opens the shared raised pinpeek drawer
    // (same chrome as a map-icon 2nd tap — founder, 2026-11-22). View Full still reaches the profile page.
    const whereTo = !!(focus && focus.kind === 'tile');
    const zoomedTo = useRef('');   // the Where to… card or pin a second tap zoomed in to
    const zoomInTo = (id) => {
      zoomedTo.current = id;
      if (mapApi.current && mapApi.current.focusLifted) mapApi.current.focusLifted(WHERE_TO_ZOOM, id);
    };
    const tapCard = (id, t) => {
      if (t === 'idea') { setSheet(null); setSelected(id); setSelType(t); return; }
      if (selected === id) {
        if (whereTo && zoomedTo.current !== id) { zoomInTo(id); return; }
        openPeek(id, t, false, { raised: true });
        return;
      }
      chosen.current = { id, type: t };
      zoomedTo.current = '';
      setSelected(id); setSelType(t); setLitId(id);
      if (whereTo) return;
      if (mapApi.current && mapApi.current.focusLifted) mapApi.current.focusLifted(CARD_ZOOM, id);
    };
    // The filter chip: what is on, in its colour, and a clear button. A tile takes the colour of its group.
    const chip = (() => {
      if (tileRec) {
        const g = tileRec.categories && tileRec.categories.length && X.groupOf ? X.groupOf({ category: tileRec.categories[0] }) : '';
        return { label: tileRec.word, colour: g ? 'var(--grp-' + g + ')' : 'var(--accent)' };
      }
      if (focus && focus.kind === 'sec') return { label: (XS.panel && XS.panel[focus.id]) || focus.id, colour: 'var(--accent)' };
      if (group) return { label: (XS.groups && XS.groups[group]) || group, colour: 'var(--grp-' + group + ')' };
      return null;
    })();
    const clearFilter = () => { setFocus(null); setGroup(''); setLitId(null); };
    // The crown with a filter on: everything clears, and the map goes back to the person's own place (or the first framing).
    const resetHome = () => {
      setFocus(null); setGroup(''); setQuery(''); setSearchOpen(false); setSelected(null); setLitId(null); setSheet(null); setPeek(null);
      const api = mapApi.current;
      if (!api) return;
      const v = api.view ? api.view() : null;
      if (v && v.user && api.survey) api.survey(v.user.lat, v.user.lng, HOME_ZOOM);
      else if (api.restore) api.restore();
    };
    const searchRef = useRef(null);
    const filtersRef = useRef(null);
    const [filterEdges, setFilterEdges] = useState({ l: false, r: false });
    const showSearch = !narrow || searchOpen || !!query;
    const measureFilters = () => {
      const el = filtersRef.current;
      if (!el) { setFilterEdges({ l: false, r: false }); return; }
      const l = el.scrollLeft > 4;
      const r = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
      setFilterEdges((p) => (p.l === l && p.r === r ? p : { l: l, r: r }));
    };
    useEffect(() => {
      const min = () => { setPeek(null); setSheet(null); setSearchOpen(false); setFocus(null); setSelected(null); setLitId(null); };
      window.addEventListener('cc-rail-map', min);
      return () => window.removeEventListener('cc-rail-map', min);
    }, []);
    // Province scale (founder, 2026-11-25): when the person zooms in from the country view to where events are drawn,
    // the panel lifts one step and shows Where to…. Only the person's own zoom counts (not the app flying somewhere).
    // Zooming further in leaves it up; a tap on empty map folds it as ever.
    const bandRef = useRef(zoomBand);
    const onZoomBand = (band, byPerson) => {
      const was = bandRef.current;
      bandRef.current = band;
      setZoomBand(band);
      // 'places' is province scale (map.jsx zoomBandFor): a pinch or a wheel from the country view passes through it
      if (!byPerson || was !== 'none' || band !== 'places') return;
      if (peekRef.current || searchOpen || focus || group || exploreMode !== 'rest') return;
      setStripSignal((n) => n + 1);
    };
    // The phone's top-left crown (founder, 2026-11-25): home and reset, every filter, search and carousel cleared.
    const resetHomeRef = useRef(resetHome);
    resetHomeRef.current = resetHome;
    useEffect(() => {
      const home = () => resetHomeRef.current();
      window.addEventListener('cc-crown-home', home);
      return () => window.removeEventListener('cc-crown-home', home);
    }, []);
    useEffect(() => {
      if (!searchOpen) { setFilterEdges({ l: false, r: false }); return undefined; }
      measureFilters();
      const t = setTimeout(measureFilters, 80);
      return () => clearTimeout(t);
    }, [searchOpen, group]);
    const nudgeFilters = (dir) => {
      const el = filtersRef.current;
      if (el) el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.7), behavior: 'smooth' });
    };
    const onFind = () => {
      if (searchOpen) { closeSearch(); return; }
      setSearchOpen(true);
      requestAnimationFrame(() => { if (searchRef.current) searchRef.current.focus(); });
    };
    const ideaMarkers = ideas.filter((i) => i.status === 'voting').filter(matches).map((i) => ({ id: i.id, type: 'idea', title: i.title, category: i.category, lat: i.lat, lng: i.lng, mapX: i.mapX, mapY: i.mapY, createdAt: i.createdAt }));
    return React.createElement('div', { ref: rootRef, className: 'flex-1 relative overflow-hidden', style: { height: '100%' }, 'data-screen': 'discover', 'data-mv2': 'home', 'data-clean': clean ? '' : undefined, 'data-narrow': narrow ? '' : undefined, 'data-crown': clean ? undefined : '', 'data-explore-min': (!clean && !panelOpen) ? '' : undefined },
      // A tap on empty map (not a pan, not a map control) goes back to level 0 from any level.
      React.createElement('div', {
        className: 'absolute inset-0',
        onPointerDownCapture: (e) => { press.current = { x: e.clientX, y: e.clientY }; },
        onClick: (e) => {
          const p = press.current;
          press.current = null;
          if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) return;
          if (e.target && e.target.closest && e.target.closest('.maplibregl-ctrl, .maplibregl-marker')) return;
          resetLevels();
          setRestSignal((n) => n + 1);
        },
      },
        React.createElement(window.StylizedMap, {
          markers, filterCategory: pinFilter, selectedId: selected, litId: litId, apiRef: mapApi,
          // #210: a pin chooses its card in the Explore panel (the panel scrolls to it); the card's second tap opens the
          // full listing. The clean map (the nav's Map) has no panel, so there a pin opens the sheet as before. Ideas keep their panel.
          onSelect: (id, t) => {
            if (t === 'idea') { setSheet(null); setSelected((p) => (p === id ? null : id)); setSelType(t); return; }
            if (clean) { openSheet(id, t); return; }
            const a = document.activeElement;
            const byKey = !!(a && a.closest && a.closest('.maplibregl-marker') && a.matches && (() => { try { return a.matches(':focus-visible'); } catch { return false; } })());
            // founder, 2026-11-18: a pin opens the pin carousel (level 2), unless the panel already holds a row of cards (a
            // focus, or every row), where the pin chooses its card in that row as before
            if (exploreMode !== 'focus' && exploreMode !== 'open') { openPeek(id, t, byKey); return; }
            // Where to…: the chosen pin's second tap zooms in to it, its third opens it, like its card (founder, 2026-11-25)
            if (whereTo && selected === id) {
              if (zoomedTo.current !== id) zoomInTo(id);
              else openPeek(id, t, byKey, { raised: true });
              return;
            }
            zoomedTo.current = '';
            // A pin chooses itself. The keyboard follows into the sheet; a finger tap leaves the sheet where it is.
            setSheet(null); setSelected(id); setSelType(t); setLitId(null); setReveal((r) => ({ id, focus: byKey, n: (r ? r.n : 0) + 1 }));
          },
          onDismissBubble: dismissBubble,
          onZoomBandChange: onZoomBand,
        })),

      // top: search bar stays its own width; category chips float below and scroll under/past the Find button
      // (founder, 2026-11-22). On a phone the bar folds into Find until tapped. X closes search → Where-to strip.
      React.createElement('div', { 'data-mv2': 'home-top', 'data-search': searchOpen ? '' : undefined },
        React.createElement('div', { 'data-mv2': 'home-bar', 'data-search': showSearch ? '' : undefined },
          showSearch && React.createElement('div', { 'data-mv2': 'home-search', onClick: () => setSearchOpen(true) },
            React.createElement(Icon, { name: 'Search', size: 18 }),
            React.createElement('input', {
              ref: searchRef, value: query, onChange: (e) => setQuery(e.target.value), onFocus: () => setSearchOpen(true),
              placeholder: XS.search, 'aria-label': XS.search, 'aria-expanded': searchOpen ? 'true' : 'false',
            }),
            query && React.createElement('button', { type: 'button', 'data-mv2': 'home-clear', 'aria-label': XS.clearSearch, onClick: (e) => { e.stopPropagation(); setQuery(''); } }, React.createElement(Icon, { name: 'X', size: 16 }))),
          chip && !(narrow && searchOpen) && React.createElement('div', { 'data-mv2': 'filter-chip', role: 'status', style: { '--chip': chip.colour } },
            React.createElement('span', { 'data-mv2': 'filter-dot', 'aria-hidden': 'true' }),
            React.createElement('span', { 'data-mv2': 'filter-chip-label', title: XS.filterChip(chip.label) }, chip.label),
            React.createElement('button', { type: 'button', 'data-mv2': 'filter-chip-x', 'aria-label': XS.clearFilter(chip.label), onClick: clearFilter },
              React.createElement(Icon, { name: 'X', size: 14 }))),
          React.createElement('button', {
            type: 'button', 'data-mv2': 'home-find', onClick: onFind,
            'aria-label': searchOpen ? XS.closeSearch : XS.searchButton,
            'aria-expanded': searchOpen ? 'true' : 'false',
          }, React.createElement(Icon, { name: searchOpen ? 'X' : 'Search', size: 20 }))),
        searchOpen && React.createElement('div', {
          'data-mv2': 'home-filters-wrap',
          'data-fade-left': filterEdges.l ? '' : undefined,
          'data-fade-right': filterEdges.r ? '' : undefined,
        },
          filterEdges.l ? React.createElement('button', {
            type: 'button', 'data-mv2': 'home-filters-arrow', 'data-dir': 'prev',
            'aria-label': (XS.panel && XS.panel.scrollLeft) || '',
            onClick: () => nudgeFilters(-1),
          }, React.createElement(Icon, { name: 'ChevronLeft', size: 16 })) : null,
          React.createElement('div', {
            ref: filtersRef, 'data-mv2': 'home-filters', role: 'radiogroup', 'aria-label': XS.chipsLabel,
            onScroll: measureFilters,
          },
            (X.GROUPS || []).map((id) => React.createElement('button', {
              key: id, type: 'button', role: 'radio', 'data-mv2': 'filter-row', 'aria-checked': group === id ? 'true' : 'false',
              style: { '--chip': 'var(--grp-' + id + ')' },
              onClick: () => setGroup((cur) => (cur === id ? '' : id)),
            }, React.createElement('span', { 'data-mv2': 'filter-dot', 'aria-hidden': 'true' }), (XS.groups && XS.groups[id]) || id))),
          filterEdges.r ? React.createElement('button', {
            type: 'button', 'data-mv2': 'home-filters-arrow', 'data-dir': 'next',
            'aria-label': (XS.panel && XS.panel.scrollRight) || '',
            onClick: () => nudgeFilters(1),
          }, React.createElement(Icon, { name: 'ChevronRight', size: 16 })) : null)),

      // zoom-gate hint + the MapTiler logo, kept above the Explore row (MapTiler's Free plan needs the logo bottom-left)
      React.createElement('div', { 'data-mv2': 'home-corner' },
        zoomBand !== 'all' && !focus && !group && React.createElement('div', { 'data-mv2': 'zoom-hint', 'data-zoom-hint': zoomBand },
          React.createElement(Icon, { name: 'ZoomIn', size: 16 }),
          React.createElement('span', null,
            zoomBand === 'none' ? 'Zoom in to see events and places'
              : 'Zoom in to see places')),
        window.MapTilerLogo && React.createElement(window.MapTilerLogo)),

      React.createElement(window.MapV2Online.Globe, { onOpenProfile: (id) => app.go('profile', { id }) }),

      // ONE bottom area: the Explore panel, or the full listing of the card that was tapped twice, never both. The panel
      // stays mounted (hidden) under the listing, so it keeps its place and the card that opened it gets focus back.
      !clean && React.createElement(X.Explore, {
        hidden: !!sheet,
        markers: rowMarkers, ideas: ideaMarkers, sources, apiRef: mapApi, selectedId: selected, reveal,
        focus, filtered: !!group || !!q,
        peek: !!peek, level: searchOpen || peek ? 1 : 0, onLevelReset: stepLevels, onMode: setExploreMode, restSignal, stripSignal,
        onFocus: (next) => { setFocus(next); setLitId(null); },
        onSectionIds: setSecIds,
        onReset: resetHome,
        onOpenChange: onPanel,
        onOpen: tapCard, onSeeAll: () => app.go('explore'), onHeight: onExploreHeight,
        onGo: (page, params) => app.go(page, params),
      }),
      // Levels 2 and 3: the pin carousel, and the chosen card's details below it once raised (the listing sheet, inline).
      // Under a full sheet (a Nearby row or an owner line picked in the details) it stays mounted, hidden, as it was.
      peek && !clean && React.createElement(X.PinCarousel, {
        items: peekItems, index: Math.max(0, peekItems.findIndex((m) => m.id === peek.ids[peek.index])), raised: peek.raised,
        hidden: !!sheet, focusCard: peek.focusCard,
        origin: peek.view ? (peek.view.user || peek.view.centre) : null,
        // km / m alone on the preview card (no "away" / "from the map centre")
        distWords: (XS.peek && XS.peek.dist) || { under: '< 100 m', metres: (n) => n + ' m', km: (n) => n + ' km' },
        sources,
        onIndex: (i) => { if (peekItems[i]) peekTo(peek.ids.indexOf(peekItems[i].id)); },
        onRaise: raisePeek, onDive: divePeek, onBack: peekBack, onClose: closePeek, returnFocus: peekReturn,
        // the inline sheet only calls onClose right after it navigated away (a link to the full page): nothing to undo here
        details: (m) => React.createElement(window.MapV2Sheet, {
          id: m.id, type: m.type, inline: true, view: peek.view, nearby: markers,
          onClose: () => {}, onPick: (id, t) => openSheet(id, t, peek.view),
          nest: {
            markers: rowMarkers, sources, selectedId: selected, focus,
            origin: peek.view ? (peek.view.user || peek.view.centre) : null,
            distWords: (XS.peek && XS.peek.dist) || { under: '< 100 m', metres: (n) => n + ' m', km: (n) => n + ' km' },
            onFocus: (next) => { setFocus(next); setLitId(null); },
            onOpen: tapCard,
            onSeeAll: () => app.go('explore'),
          },
        }),
      }),
      // a chosen card tapped again opens the expanded sheet (#210: full, its cover and distance, swipe down back to the
      // panel; it never moves the map); the clean map's pin opens today's half sheet
      sheet && React.createElement(window.MapV2Sheet, {
        id: sheet.id, type: sheet.type, expanded: !clean, view: sheet.view,
        onClose: closeSheet, onOccupy: (pad) => { if (mapApi.current) mapApi.current.focusSelected(pad); },
        nearby: markers,
        // a Nearby pick keeps the place the distances were measured from (the map has moved under the sheet since)
        onPick: (id, t) => openSheet(id, t, sheet.view),
      }),
      selected && selType === 'idea' && React.createElement(IdeaPanel, { id: selected, onClose: () => setSelected(null) }));
  
  }

  window.HomePage = HomePage;
})();
