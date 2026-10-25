// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — serving areas (issue #259): the area picker, no mini-map.
//  ------------------------------------------------------------------
//  A nested, responsive checklist (province, then city or town, then an optional suburb) for a Contributor with no fixed
//  location, so people looking at those areas find them under the globe. The rules (kept in serving-areas-lib.jsx):
//    * Every row has a chevron to open it and, separately, a checkbox to serve it. Opening Gauteng ticks nothing.
//    * A tick means that area and everything inside it, and never goes upward. A parent that holds a chosen area shows a
//      small neutral dot ("contains a chosen area"): display only, it stores nothing.
//    * A distance ("also reach people within …") is an add-on that needs a centre: it is disabled, with one line saying why,
//      until at least one area is chosen. Its centre defaults to the most specific chosen area.
//    * The owner chooses a plain tag, Online (default) or No fixed place, that the public list shows on their row.
//  Three pieces, all PURE ON THEIR PROPS so a test mounts them against stand-ins:
//    ServingAreasPicker   the controlled picker (index of areas + a selection in, the new selection out)
//    ServingAreasField    loads the area index itself; used INSIDE a form (the Apply wizard keeps the choice in its state)
//    ServingAreasEditor   loads and SAVES the owner's choice through the API (the Dashboard, the pending Dashboard)
//  Every word comes from window.MapV2Strings.serving; every request goes through window.CCServing.
//
//  Public surface: window.ServingAreas = { Picker, Field, Editor }.
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const { useState, useEffect, useCallback, useRef, useMemo } = React;
  const { cx, Button } = window.UI;
  const Icon = window.Icon;
  const Sv = () => window.CCServing;
  const Str = () => window.MapV2Strings.serving;
  const PubStr = () => window.MapV2Strings.online;

  // one shape for every 44 px target
  const target = 'inline-flex items-center justify-center min-h-[44px] min-w-[44px] shrink-0';
  const srOnly = 'absolute w-px h-px overflow-hidden whitespace-nowrap';

  // ── loading the hierarchy ────────────────────────────────────────────
  /**
   * The area index and the places a person has opened. Provinces and cities/towns come in one cached request; a city's
   * suburbs load only when it is opened. Saved choices that are not in the index yet (a suburb picked earlier) pull the
   * suburb list once so they can be named. `chosenIds` is the current selection's ids.
   */
  function useAreaIndex(chosenIds) {
    const C = Sv();
    const [index, setIndex] = useState({ byId: {}, kids: {} });
    const [state, setState] = useState('loading');               // loading | ready | error
    const [loadingKids, setLoadingKids] = useState({});
    const asked = useRef({});                                     // parents (and 'suburbs') already requested
    const alive = useRef(true);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

    const merge = useCallback((areas) => { if (alive.current) setIndex((cur) => C.mergeAreas(cur, areas)); }, []);
    const load = useCallback(async () => {
      setState('loading');
      const r = await C.fetchAreas('');
      if (!alive.current) return;
      if (!r.ok || !r.areas.length) { setState('error'); return; }
      setIndex(C.buildIndex(r.areas));
      setState('ready');
    }, []);
    useEffect(() => { load(); }, [load]);
    const retry = useCallback(() => { asked.current = {}; load(); }, [load]);

    /** Open a city or town: fetch its suburbs once. */
    const expand = useCallback(async (id) => {
      if (asked.current[id]) return;
      asked.current[id] = true;
      setLoadingKids((m) => ({ ...m, [id]: true }));
      const r = await C.fetchAreas('?parent=' + encodeURIComponent(id));
      if (!alive.current) return;
      if (r.ok) merge(r.areas); else asked.current[id] = false;   // a failed read can be asked again
      setLoadingKids((m) => ({ ...m, [id]: false }));
    }, [merge]);

    // a saved suburb is not in the first index: ask for the suburbs once so it has a name
    useEffect(() => {
      if (state !== 'ready' || asked.current.suburbs) return;
      if (!(chosenIds || []).some((id) => !index.byId[id])) return;
      asked.current.suburbs = true;
      C.fetchAreas('?level=suburb&limit=1000').then((r) => { if (r.ok) merge(r.areas); });
    }, [state, chosenIds, index, merge]);

    return { index, state, retry, expand, loadingKids };
  }

  // ── one row ──────────────────────────────────────────────────────────
  function AreaRow({ id, depth, index, sel, open, loadingKids, onTick, onToggleOpen, flat }) {
    const C = Sv();
    const S = Str();
    const a = index.byId[id];
    if (!a) return null;
    const ticked = sel.areaIds.indexOf(id) >= 0;
    const canOpen = !flat && a.level !== 'suburb';
    const isOpen = canOpen && !!open[id];
    const inside = !ticked && C.hasChosenInside(index, sel.areaIds, id);
    const wide = a.level !== 'suburb';                           // a province or a city or town covers everything inside it
    const parent = flat && a.parentId && index.byId[a.parentId] ? index.byId[a.parentId].name : '';
    const kids = C.childIds(index, id);
    const note = id + '-note';
    return h('li', { 'data-serving-row': id, className: '' },
      h('div', { className: 'flex items-center', style: { paddingLeft: depth * 20 } },
        canOpen
          ? h('button', {
            type: 'button', 'data-serving-expand': id, 'aria-expanded': isOpen,
            'aria-label': isOpen ? S.collapse(a.name) : S.expand(a.name),
            onClick: () => onToggleOpen(id), className: cx(target, 'rounded-xl text-muted-foreground hover:text-foreground'),
          }, h(Icon, { name: isOpen ? 'ChevronDown' : 'ChevronRight', size: 18 }))
          : h('span', { className: cx(target, 'pointer-events-none'), 'aria-hidden': 'true' }),
        h('button', {
          type: 'button', role: 'checkbox', 'data-serving-tick': id, 'aria-checked': ticked,
          'aria-label': wide ? S.tickAll(a.name) : S.tick(a.name), 'aria-describedby': inside ? note : undefined,
          onClick: () => onTick(id), className: cx(target, 'rounded-xl'),
        }, h('span', {
          className: cx('flex items-center justify-center w-6 h-6 rounded-md border-2 transition-colors',
            ticked ? 'bg-gold border-gold text-white' : inside ? 'border-gold bg-accent/60' : 'border-border bg-background'),
        }, ticked ? h(Icon, { name: 'Check', size: 14 }) : inside ? h('span', { 'aria-hidden': 'true', className: 'w-2 h-2 rounded-full bg-gold' }) : null)),
        h('button', {
          type: 'button', tabIndex: -1, onClick: () => (canOpen ? onToggleOpen(id) : onTick(id)),
          className: 'flex-1 min-w-0 min-h-[44px] flex flex-col items-start justify-center text-left pl-1 pr-2',
        },
          h('span', { className: 'flex items-baseline gap-2 flex-wrap' },
            h('span', { className: 'text-sm font-semibold text-foreground' }, a.name),
            h('span', { className: 'text-[11px] text-muted-foreground' }, S.levels[a.level]),
            parent && h('span', { className: 'text-[11px] text-muted-foreground' }, '· ' + parent)),
          ticked && wide && h('span', { className: 'text-[11px] font-semibold text-gold-dark' }, S.includes),
          inside && h('span', { id: note, className: srOnly }, S.containsChosen))),
      isOpen && h('ul', { className: 'space-y-0' },
        a.level === 'place' && h('li', { className: 'text-[11px] font-bold uppercase tracking-wide text-muted-foreground', style: { paddingLeft: (depth + 1) * 20 + 44 } }, S.suburbsHint),
        loadingKids[id]
          ? h('li', { className: 'text-xs text-muted-foreground min-h-[44px] flex items-center', style: { paddingLeft: (depth + 1) * 20 + 44 } }, S.loadingChildren)
          : kids.length
            ? kids.map((k) => h(AreaRow, { key: k, id: k, depth: depth + 1, index, sel, open, loadingKids, onTick, onToggleOpen, flat: false }))
            : a.level === 'place' && h('li', { className: 'text-xs text-muted-foreground min-h-[44px] flex items-center', style: { paddingLeft: (depth + 1) * 20 + 44 } }, S.noSuburbs)));
  }

  // ── the distance add-on ──────────────────────────────────────────────
  function RadiusBlock({ index, sel, onChange }) {
    const C = Sv();
    const S = Str().radius;
    const enabled = sel.areaIds.length > 0;
    const km = enabled ? sel.radiusKm : null;
    const choices = [null].concat(C.PRESETS);
    return h('div', { 'data-serving-radius': enabled ? 'enabled' : 'disabled', 'aria-disabled': !enabled, className: cx('rounded-2xl border border-border p-3 space-y-2', !enabled && 'opacity-70') },
      h('p', { className: 'text-xs font-semibold text-foreground/80', id: 'serving-radius-title' }, S.title),
      !enabled && h('p', { 'data-serving-radius-reason': '1', className: 'text-[11px] text-muted-foreground' }, S.needsArea),
      h('div', { role: 'radiogroup', 'aria-labelledby': 'serving-radius-title', className: 'flex flex-wrap gap-2' },
        choices.map((v) => {
          const on = (v === null && km === null) || v === km;
          return h('button', {
            key: String(v), type: 'button', role: 'radio', 'aria-checked': on, disabled: !enabled,
            'data-serving-radius-km': v === null ? 'off' : String(v),
            onClick: () => onChange(C.setRadius(index, sel, v)),
            className: cx('min-h-[44px] min-w-[56px] px-4 rounded-full text-xs font-bold border transition-colors disabled:cursor-not-allowed',
              on ? 'bg-gold text-white border-gold' : 'bg-card text-foreground border-border'),
          }, v === null ? S.off : S.km(v));
        })),
      enabled && km !== null && sel.areaIds.length > 1 && h('label', { className: 'block space-y-1' },
        h('span', { className: 'text-xs font-semibold text-foreground/80' }, S.measuredFrom),
        h('select', {
          'data-serving-centre': '1', value: sel.radiusCentreAreaId || '', onChange: (e) => onChange(C.setCentre(index, sel, e.target.value)),
          className: 'w-full min-h-[44px] rounded-xl border border-border bg-card px-3 text-sm text-foreground',
        }, sel.areaIds.map((id) => index.byId[id]).filter(Boolean).map((a) => h('option', { key: a.id, value: a.id }, a.name)))),
      enabled && km !== null && h('p', { className: 'text-[11px] text-muted-foreground' }, S.hint));
  }

  // ── how people find you ──────────────────────────────────────────────
  function PresenceBlock({ sel, onChange }) {
    const C = Sv();
    const S = Str().presence;
    const tags = PubStr().tag;
    const opts = [['online', tags.online, S.online], ['no_fixed_place', tags.noFixedPlace, S.noFixedPlace]];
    return h('div', { className: 'space-y-2' },
      h('p', { className: 'text-xs font-semibold text-foreground/80', id: 'serving-presence-title' }, S.title),
      h('div', { role: 'radiogroup', 'aria-labelledby': 'serving-presence-title', className: 'grid grid-cols-1 sm:grid-cols-2 gap-2' },
        opts.map((o) => {
          const on = sel.presence === o[0];
          return h('button', {
            key: o[0], type: 'button', role: 'radio', 'aria-checked': on, 'data-serving-presence': o[0],
            onClick: () => onChange(C.setPresence(sel, o[0])),
            className: cx('min-h-[44px] text-left rounded-2xl border px-3 py-2 transition-colors', on ? 'border-gold bg-accent/60' : 'border-border bg-card'),
          },
            h('span', { className: 'block text-sm font-semibold text-foreground' }, o[1]),
            h('span', { className: 'block text-[11px] text-muted-foreground' }, o[2]));
        })));
  }

  // ── the picker ───────────────────────────────────────────────────────
  /**
   * Props: index (from CCServing.buildIndex), state ('loading' | 'ready' | 'error'), onRetry, value (the selection),
   * onChange (selection) => void, onExpand (areaId) => void, loadingKids ({id: true}), onLimit () => void (a tick past the cap).
   */
  function ServingAreasPicker({ index, state, onRetry, value, onChange, onExpand, loadingKids, onLimit }) {
    const C = Sv();
    const S = Str();
    const sel = useMemo(() => C.normalise(index, value || C.emptySelection()), [index, value]);
    const [open, setOpen] = useState({});
    const [query, setQuery] = useState('');
    const [notice, setNotice] = useState('');

    const toggleOpen = (id) => {
      const nowOpen = !open[id];
      setOpen((m) => ({ ...m, [id]: nowOpen }));
      if (nowOpen && index.byId[id] && index.byId[id].level === 'place' && onExpand) onExpand(id);
    };
    const tick = (id) => {
      const r = C.toggleArea(index, sel, id);
      if (r.reason === 'too_many') { setNotice(S.tooMany(C.MAX_AREAS)); if (onLimit) onLimit(); return; }
      setNotice('');
      onChange(r.selection);
    };
    const results = query.trim() ? C.search(index, query) : null;
    const rowProps = { index, sel, open, loadingKids: loadingKids || {}, onTick: tick, onToggleOpen: toggleOpen };

    return h('div', { 'data-serving-picker': '1', className: 'space-y-4' },
      h('div', { className: 'space-y-1' },
        h('p', { className: 'text-sm font-semibold text-foreground' }, S.title),
        h('p', { className: 'text-xs text-muted-foreground' }, S.intro),
        h('p', { className: 'text-[11px] text-muted-foreground' }, S.tickMeaning + ' ' + S.noUpward)),
      state === 'loading' && h('p', { 'data-serving-state': 'loading', role: 'status', className: 'text-xs text-muted-foreground min-h-[44px] flex items-center gap-2' },
        h('span', { className: 'w-4 h-4 rounded-full border-2 border-gold border-t-transparent spin', 'aria-hidden': 'true' }), S.loading),
      state === 'error' && h('div', { 'data-serving-state': 'error', role: 'alert', className: 'rounded-2xl border border-border p-3 flex items-center justify-between gap-3' },
        h('p', { className: 'text-xs text-foreground' }, S.loadError),
        h(Button, { variant: 'outline', size: 'sm', className: 'min-h-[44px]', onClick: onRetry }, S.retry)),
      state === 'ready' && h('div', { className: 'space-y-2' },
        h('div', { className: 'relative' },
          h(Icon, { name: 'Search', size: 16, className: 'absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none' }),
          h('input', {
            type: 'search', value: query, onChange: (e) => setQuery(e.target.value), 'aria-label': S.searchLabel, placeholder: S.searchLabel,
            'data-serving-search': '1', className: 'w-full min-h-[44px] rounded-xl border border-border bg-card pl-9 pr-3 text-sm text-foreground',
          })),
        h('ul', { 'data-serving-list': '1', className: 'rounded-2xl border border-border bg-card divide-y divide-border/60 px-1' },
          results
            ? (results.length
              ? results.map((id) => h(AreaRow, { key: id, id, depth: 0, flat: true, ...rowProps }))
              : h('li', { className: 'text-xs text-muted-foreground min-h-[44px] flex items-center px-3' }, S.noMatches))
            : C.rootIds(index).map((id) => h(AreaRow, { key: id, id, depth: 0, flat: false, ...rowProps }))),
        notice && h('p', { role: 'alert', className: 'text-[11px] font-semibold text-destructive' }, notice)),
      state === 'ready' && h('p', { 'data-serving-summary': '1', 'aria-live': 'polite', className: 'text-sm font-bold text-foreground' }, C.summaryText(index, sel.areaIds, S)),
      state === 'ready' && h(RadiusBlock, { index, sel, onChange }),
      state === 'ready' && h(PresenceBlock, { sel, onChange }));
  }

  // ── inside a form: the Apply wizard ──────────────────────────────────
  /** Props: value (a selection), onChange (selection) => void. The form keeps the choice and saves it after the application is sent. */
  function ServingAreasField({ value, onChange }) {
    const sel = value || Sv().emptySelection();
    const { index, state, retry, expand, loadingKids } = useAreaIndex(sel.areaIds);
    // the form also gets the plain-words summary ("Serving: all of Pretoria") so its review step can show the choice by name
    const change = (next) => onChange(next, Sv().summaryText(index, next.areaIds, Str()));
    return h('div', { className: 'rounded-2xl bg-accent/30 border border-border p-3' },
      h(ServingAreasPicker, { index, state, onRetry: retry, value: sel, onChange: change, onExpand: expand, loadingKids }));
  }

  // ── the Dashboard: load, edit, save ──────────────────────────────────
  /**
   * Props: contributorId (a uuid, or null for the signed-in person's own listing), authedFetch (window.authedFetch),
   * toast ((message, kind) => void). Saving is its own button: areas do not travel with "Save profile".
   */
  function ServingAreasEditor({ contributorId, authedFetch, toast }) {
    const C = Sv();
    const S = Str();
    const [sel, setSel] = useState(null);                         // null until the saved choice is read
    const [saved, setSaved] = useState('');                       // the last saved payload, to know when something changed
    const [loadFailed, setLoadFailed] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const alive = useRef(true);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

    const read = useCallback(async () => {
      setLoadFailed(false);
      const r = await C.loadSelection(authedFetch, contributorId || null);
      if (!alive.current) return;
      if (!r.ok) { setLoadFailed(true); return; }
      setSel(r.selection);
      setSaved(JSON.stringify(C.payloadOf(r.selection)));
    }, [authedFetch, contributorId]);
    useEffect(() => { setSel(null); read(); }, [read]);

    const { index, state, retry, expand, loadingKids } = useAreaIndex(sel ? sel.areaIds : []);
    const normalised = sel ? C.normalise(index, sel) : null;
    const dirty = !!normalised && JSON.stringify(C.payloadOf(normalised)) !== saved;

    const save = async () => {
      if (!normalised || saving) return;
      setSaving(true);
      setError('');
      const r = await C.saveSelection(authedFetch, contributorId || null, normalised);
      if (!alive.current) return;
      setSaving(false);
      if (r.ok) {
        setSel(r.selection);
        setSaved(JSON.stringify(C.payloadOf(r.selection)));
        if (toast) toast(S.saved, 'green');
      } else {
        setError(r.message);
        if (toast) toast(r.message, 'red');
      }
    };

    if (loadFailed) {
      return h('div', { 'data-serving-editor': 'error', role: 'alert', className: 'rounded-2xl border border-border p-3 flex items-center justify-between gap-3' },
        h('p', { className: 'text-xs text-foreground' }, S.loadError),
        h(Button, { variant: 'outline', size: 'sm', className: 'min-h-[44px]', onClick: read }, S.retry));
    }
    if (!sel) {
      return h('p', { 'data-serving-editor': 'loading', role: 'status', className: 'text-xs text-muted-foreground min-h-[44px] flex items-center' }, S.loading);
    }
    return h('div', { 'data-serving-editor': 'ready', className: 'bg-card rounded-2xl border border-border p-4 space-y-4' },
      h(ServingAreasPicker, { index, state, onRetry: retry, value: sel, onChange: setSel, onExpand: expand, loadingKids }),
      error && h('p', { role: 'alert', className: 'text-xs font-semibold text-destructive' }, error),
      h(Button, { variant: 'gold', icon: 'Check', 'data-serving-save': '1', disabled: !dirty || saving || state !== 'ready', onClick: save, className: 'w-full min-h-[44px]' }, saving ? S.saving : S.save));
  }

  window.ServingAreas = { Picker: ServingAreasPicker, Field: ServingAreasField, Editor: ServingAreasEditor };
})();
