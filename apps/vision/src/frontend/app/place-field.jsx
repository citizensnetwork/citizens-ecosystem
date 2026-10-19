// ════════════════════════════════════════════════════════════════════
//  Citizens Vision — the optional "Place" field (window.Screens.PlaceField)
//  ------------------------------------------------------------------
//  Lives on the Log-an-activity form. A person can:
//    · type a place and pick a MapTiler geocoding result  → name + coordinates
//    · paste a coordinate pair ("-25.7461, 28.1881")        → name + coordinates
//    · drop a pin on a small map (centre pin, "Use this spot") → coordinates
//      (+ a name from reverse geocoding, which they can edit)
//    · or just type a name and leave it                    → name only
//  Only the first three put the activity on the Timeline Map; the field says
//  which one is happening. Nothing here can stop an activity being logged: the
//  field is optional, and every failure falls back to a plain text name.
//
//  The pure parts (URLs, parsing, the payload) are in place-lib.jsx
//  (window.CV_PLACE, unit-tested). MapLibre is the vendored copy the Timeline
//  Map uses; views.jsx passes its lazy loader in as `loadMap`, so a person who
//  never opens the pin map never downloads it. The key is restricted by origin:
//  a 401/403 from MapTiler turns search and the pin map off for the rest of
//  this page and the field says so.
// ════════════════════════════════════════════════════════════════════
(() => {
  const { useState, useEffect, useRef, useMemo, useId } = React;
  const P = window.CV_PLACE;
  const TL = window.CV_TIMELINE;

  // Shared by every field on the page: once MapTiler refuses this site's key
  // there is no point asking again until the page is reloaded.
  const geo = { refused: false };
  // query (lowercased) → results, so retyping or backspacing costs no request.
  const cache = new Map();
  const CACHE_MAX = 40;

  const control = {
    border: "1px solid var(--border)", borderRadius: 12, padding: "9px 14px", fontSize: 14,
    background: "var(--surface-card)", color: "var(--text-primary)",
  };
  const smallBtn = {
    border: "1px solid var(--border)", background: "transparent", color: "var(--text-primary)",
    borderRadius: 12, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
  };
  const linkBtn = {
    border: "none", background: "transparent", padding: 0, margin: 0, cursor: "pointer",
    color: "var(--brand-ink)", fontSize: 12.5, fontWeight: 700, textDecoration: "underline",
  };

  // A pin whose TIP sits exactly on the map's centre (the point we read).
  function CentrePin() {
    return (
      <svg width="30" height="38" viewBox="0 0 30 38" aria-hidden="true"
        style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -100%)", marginTop: 1, pointerEvents: "none", filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.35))" }}>
        <path d="M15 37C15 37 2 22.5 2 14a13 13 0 0 1 26 0c0 8.5-13 23-13 23z" fill="#D9A50C" stroke="#141414" strokeWidth="2" />
        <circle cx="15" cy="14" r="4.5" fill="#FFFFFF" />
      </svg>
    );
  }

  // The small map. The pin is fixed at the centre and the MAP moves under it
  // (drag or arrow keys, + / − to zoom): robust on touch and reachable without
  // a mouse, unlike dragging a marker.
  function PinMap({ env, loadMap, start, onUse, onCancel, onRefused }) {
    const hostRef = useRef(null);
    const mapRef = useRef(null);
    const [state, setState] = useState("loading"); // loading | ready | failed
    const [centre, setCentre] = useState(start);

    useEffect(() => {
      let cancelled = false;
      let map = null;
      let refusedSeen = false;
      loadMap().then((ml) => {
        if (cancelled || !hostRef.current) return;
        const theme = document.documentElement.getAttribute("data-theme") === "noir" ? "noir" : "light";
        const url = TL.styleUrl(env, theme);
        if (!url) { onRefused(); return; }
        try {
          map = new ml.Map({
            container: hostRef.current, style: url, center: [start.lng, start.lat], zoom: start.zoom,
            attributionControl: { compact: true },
          });
        } catch (e) { setState("failed"); return; }
        mapRef.current = map;
        window.__cvPinMap = map; // handle for specs and the live walk (as window.__cvMap)
        map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
        map.on("load", () => { if (!cancelled) setState("ready"); });
        map.on("moveend", () => {
          const c = map.getCenter().wrap();
          setCentre({ lat: c.lat, lng: c.lng });
        });
        map.on("error", (ev) => {
          if (!refusedSeen && TL.isKeyRefusal(ev && ev.error)) { refusedSeen = true; onRefused(); }
        });
      }).catch(() => { if (!cancelled) setState("failed"); });
      return () => {
        cancelled = true;
        if (map) map.remove();
        if (window.__cvPinMap === map) window.__cvPinMap = null;
        mapRef.current = null;
      };
    }, []);

    const use = () => {
      const map = mapRef.current;
      if (!map) return;
      const c = map.getCenter().wrap();
      onUse({ lat: c.lat, lng: c.lng });
    };

    return (
      <div data-cv-pinmap="" style={{ marginTop: 10, border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", background: "var(--surface-card)" }}>
        <div style={{ position: "relative", height: 260, background: "var(--surface-sunk)" }}>
          <div ref={hostRef} role="application" aria-label="Map for choosing a place. Move the map so the pin is over the place."
            style={{ position: "absolute", inset: 0 }} />
          {state === "failed" ? null : <CentrePin />}
          <a href="https://www.maptiler.com" target="_blank" rel="noopener noreferrer" data-cv-maptiler-logo=""
            style={{ position: "absolute", left: 8, bottom: 8, display: "inline-block", lineHeight: 0, padding: "3px 6px", borderRadius: 999, background: "rgba(23,19,16,0.62)" }}>
            <img src="https://api.maptiler.com/resources/logo.svg" alt="MapTiler logo" width="54" height="16" decoding="async" />
          </a>
        </div>
        <div style={{ padding: "10px 12px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            {state === "failed"
              ? "The map could not be loaded here. Type the place name instead."
              : "Move the map (drag, or the arrow keys; + and − zoom) until the pin is over the place. Pin: " + P.coordLabel(centre.lat, centre.lng)}
          </div>
          <button type="button" onClick={onCancel} style={smallBtn}>Cancel</button>
          <button type="button" onClick={use} disabled={state !== "ready"}
            style={{ ...smallBtn, background: "var(--brand)", color: "var(--on-brand)", border: "1px solid var(--brand-strong)", opacity: state === "ready" ? 1 : 0.55, cursor: state === "ready" ? "pointer" : "default" }}>
            Use this spot
          </button>
        </div>
      </div>
    );
  }

  // value: { name, lat, lng }  (raw form state — normalised only when sent)
  // onChange(next) · onSubmit() logs the activity (Enter on a closed list)
  // loadMap() → Promise<maplibregl> · env: window.__CV_ENV
  // autoFocus moves the caret into the box on mount (the activity-row editor).
  // error: an inline message under the field, linked with aria-describedby.
  function PlaceField({ value, onChange, onSubmit, loadMap, env, autoFocus, error }) {
    const uid = useId();
    const listId = uid + "-list";
    const statusId = uid + "-status";
    const errorId = uid + "-error";
    const inputRef = useRef(null);
    const valueRef = useRef(value);
    valueRef.current = value;

    const [typed, setTyped] = useState(""); // the text of the last USER edit; picking a result doesn't change it
    const [results, setResults] = useState([]);
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    const [net, setNet] = useState("idle"); // idle | searching | done | down
    const [refused, setRefused] = useState(geo.refused);
    const [pinOpen, setPinOpen] = useState(false);

    useEffect(() => {
      if (autoFocus && inputRef.current) inputRef.current.focus();
    }, [autoFocus]);

    // A failed empty save must leave the caret in the field, including when
    // the message was already showing and they try again.
    useEffect(() => {
      if (error && inputRef.current) inputRef.current.focus();
    }, [error]);

    const keyed = TL.hasKey(env);
    const canSearch = keyed && !refused;
    const pair = useMemo(() => P.parseCoordPair(typed), [typed]);
    const pairResult = pair
      ? [{ id: "coords", label: "Coordinates " + P.coordLabel(pair.lat, pair.lng), lat: pair.lat, lng: pair.lng }]
      : null;
    const shown = pairResult || results;
    const kind = P.kind(value);

    const markRefused = () => {
      geo.refused = true;
      setRefused(true);
      setPinOpen(false);
      setOpen(false);
      setNet("idle");
    };

    // Search as they type: debounced, one request in flight, answers cached.
    useEffect(() => {
      if (!canSearch) return undefined;
      const q = P.cleanName(typed);
      const url = P.searchUrl(env, q);
      if (!url) { setResults([]); setNet("idle"); return undefined; }
      const hit = cache.get(q.toLowerCase());
      if (hit) { setResults(hit); setNet("done"); setActive(-1); setOpen(true); return undefined; }
      let live = true;
      const ctl = new AbortController();
      setNet("searching");
      const timer = setTimeout(async () => {
        try {
          const res = await fetch(url, { signal: ctl.signal });
          if (res.status === 401 || res.status === 403) { if (live) markRefused(); return; }
          if (!res.ok) throw new Error("status " + res.status);
          const list = P.parseResults(await res.json());
          if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
          cache.set(q.toLowerCase(), list);
          if (!live) return;
          setResults(list); setNet("done"); setActive(-1); setOpen(true);
        } catch (e) {
          if (live && !(e && e.name === "AbortError")) setNet("down");
        }
      }, 400);
      return () => { live = false; clearTimeout(timer); ctl.abort(); };
    }, [typed, canSearch]);

    // The place was emptied (Clear, an emptied box, or the form was reset after
    // logging): forget the search that belonged to it, so nothing stale reopens.
    useEffect(() => {
      if (kind === "empty" && !P.cleanName(value.name)) {
        setTyped(""); setResults([]); setNet("idle"); setOpen(false); setActive(-1); setPinOpen(false);
      }
    }, [kind, value.name]);

    const edit = (text) => {
      setTyped(text);
      setOpen(true);
      // Emptying the box removes the whole place, pin included.
      onChange(P.cleanName(text) ? { name: text, lat: value.lat, lng: value.lng } : P.EMPTY);
    };

    const pick = (r) => {
      onChange({ name: r.label, lat: r.lat, lng: r.lng });
      setOpen(false);
      setActive(-1);
    };

    const clearAll = () => {
      onChange(P.EMPTY);
      if (inputRef.current) inputRef.current.focus();
    };

    const onKeyDown = (e) => {
      const listOpen = open && shown.length > 0;
      if (e.key === "ArrowDown" && shown.length > 0) {
        e.preventDefault();
        setOpen(true);
        setActive((i) => (i + 1) % shown.length);
      } else if (e.key === "ArrowUp" && listOpen) {
        e.preventDefault();
        setActive((i) => (i <= 0 ? shown.length - 1 : i - 1));
      } else if (e.key === "Escape" && listOpen) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      } else if (e.key === "Enter") {
        // With choices showing, Enter chooses (the first one if none is highlighted);
        // logging is then a deliberate second step. With none showing, Enter logs.
        if (listOpen) { e.preventDefault(); pick(shown[active >= 0 ? active : 0]); }
        else if (onSubmit) { onSubmit(); }
      }
    };

    // A dropped pin: coordinates now, a name from reverse geocoding if there is
    // none yet (best effort — never blocks, never overwrites what they typed).
    const usePin = (c) => {
      setPinOpen(false);
      onChange({ name: value.name, lat: c.lat, lng: c.lng });
      if (P.cleanName(value.name)) return;
      const url = P.reverseUrl(env, c.lat, c.lng);
      if (!url) return;
      fetch(url)
        .then((res) => {
          if (res.status === 401 || res.status === 403) { markRefused(); return null; }
          return res.ok ? res.json() : null;
        })
        .then((json) => {
          const name = json ? P.parseReverse(json) : "";
          const cur = valueRef.current;
          // Only if they have not typed a name, moved the pin or cleared it meanwhile.
          if (name && !P.cleanName(cur.name) && cur.lat === c.lat && cur.lng === c.lng) {
            onChange({ name, lat: c.lat, lng: c.lng });
          }
        })
        .catch(() => { /* the pin stands; it is named by its coordinates */ });
    };

    const removePin = () => onChange({ name: value.name, lat: null, lng: null });

    const startView = P.kind(value) === "pinned"
      ? { lat: value.lat, lng: value.lng, zoom: 15 }
      : { lat: P.HOME.lat, lng: P.HOME.lng, zoom: 11 };

    // One honest sentence about what will happen to this place.
    let helper;
    if (kind === "pinned") {
      helper = "On the Timeline Map at " + P.coordLabel(value.lat, value.lng) + ".";
    } else if (refused) {
      helper = "The street-map provider did not accept this site, so place search and pins are off. " +
        (kind === "text" ? "Your place is saved as text only and won't appear on the Timeline Map." : "You can still type a place name; it is saved as text and won't appear on the Timeline Map.");
    } else if (!keyed) {
      helper = "Place search is switched off on this site. A name is saved as text and won't appear on the Timeline Map; enter coordinates like -25.7461, 28.1881 to put it there.";
    } else if (net === "searching") {
      helper = "Searching…";
    } else if (net === "down") {
      helper = "Place search isn't answering right now. You can keep the name as text, or try again in a moment.";
    } else if (net === "done" && shown.length === 0 && kind === "text") {
      helper = "No match for that. Try fewer words, drop a pin, or keep it as a plain name (text only, not on the Timeline Map).";
    } else if (kind === "text") {
      helper = "Saved as text only. Pick a result, or drop a pin, to show it on the Timeline Map.";
    } else {
      helper = "Optional. A place puts this activity on your Timeline Map.";
    }

    const listOpen = open && shown.length > 0;
    const describedBy = error ? errorId + " " + statusId : statusId;
    return (
      <div style={{ flex: "1 1 100%", minWidth: 0 }}>
        <label htmlFor={uid + "-input"} style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", margin: "0 2px 5px" }}>
          Place <span style={{ fontWeight: 600, color: "var(--text-tertiary)" }}>(optional)</span>
        </label>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
            <input id={uid + "-input"} ref={inputRef} type="text" autoComplete="off" spellCheck={false}
              role="combobox" aria-autocomplete="list" aria-expanded={listOpen} aria-controls={listId}
              aria-activedescendant={listOpen && active >= 0 ? uid + "-opt-" + active : undefined}
              aria-describedby={describedBy} aria-invalid={error ? "true" : undefined} maxLength={P.NAME_MAX}
              value={value.name} placeholder={kind === "pinned" ? "Name this place" : "Search a place, or type a name"}
              onChange={(e) => edit(e.target.value)} onKeyDown={onKeyDown}
              onFocus={() => { if (shown.length > 0) setOpen(true); }} onBlur={() => setOpen(false)}
              style={{ ...control, width: "100%", boxSizing: "border-box" }} />
            {listOpen ? (
              <div style={{ position: "absolute", left: 0, right: 0, top: "calc(100% + 4px)", zIndex: 30, background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.14)", overflow: "hidden" }}>
                <ul id={listId} role="listbox" aria-label="Places that match" style={{ listStyle: "none", margin: 0, padding: 4 }}>
                  {shown.map((r, i) => (
                    <li key={r.id} id={uid + "-opt-" + i} role="option" aria-selected={i === active}
                      onMouseDown={(e) => e.preventDefault()} onClick={() => pick(r)} onMouseEnter={() => setActive(i)}
                      style={{ padding: "8px 10px", borderRadius: 8, fontSize: 13.5, cursor: "pointer", background: i === active ? "var(--gold-50)" : "transparent", color: "var(--text-primary)" }}>
                      {r.label}
                    </li>
                  ))}
                </ul>
                {pairResult ? null : (
                  <div style={{ padding: "5px 12px 7px", fontSize: 11, color: "var(--text-tertiary)", borderTop: "1px solid var(--divider)" }}>
                    Search by MapTiler · © OpenStreetMap contributors
                  </div>
                )}
              </div>
            ) : null}
          </div>
          {canSearch ? (
            <button type="button" onClick={() => setPinOpen((v) => !v)} aria-expanded={pinOpen} style={smallBtn}>
              {pinOpen ? "Close map" : "Drop a pin"}
            </button>
          ) : null}
          {kind !== "empty" ? (
            <button type="button" onClick={clearAll} style={smallBtn}>Clear</button>
          ) : null}
        </div>
        {error ? (
          <div id={errorId} style={{ margin: "6px 2px 0", fontSize: 13, fontWeight: 600, color: "var(--danger)" }}>{error}</div>
        ) : null}
        <div id={statusId} role="status" aria-live="polite" style={{ margin: "6px 2px 0", fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          {helper}{" "}
          {kind === "pinned" ? <button type="button" onClick={removePin} style={linkBtn}>Remove pin</button> : null}
        </div>
        {pinOpen && canSearch ? (
          <PinMap env={env} loadMap={loadMap} start={startView} onUse={usePin} onCancel={() => setPinOpen(false)} onRefused={markRefused} />
        ) : null}
      </div>
    );
  }

  window.Screens = Object.assign(window.Screens || {}, { PlaceField });
})();
