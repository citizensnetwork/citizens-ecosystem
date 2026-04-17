/**
 * Quick-panel user preferences — persisted in localStorage (per-device).
 *
 * The user chooses up to 5 categories to surface as quick-access buttons on
 * the events map. Defaults match the original hard-coded set for parity.
 */

const STORAGE_KEY = "cc-quick-panel-ids";
export const QUICK_PANEL_MAX = 5;
export const QUICK_PANEL_DEFAULT_COUNT = 4;

/** Default ordered list of quick-access tool ids (existing behaviour). */
export const DEFAULT_QUICK_IDS: string[] = [
  "bible-study",
  "coffee",
  "runs",
  "churches",
  "outreaches",
];

/** Read saved ids, falling back to the default set. */
export function loadQuickIds(): string[] {
  if (typeof window === "undefined") return DEFAULT_QUICK_IDS.slice(0, QUICK_PANEL_DEFAULT_COUNT);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_QUICK_IDS.slice(0, QUICK_PANEL_DEFAULT_COUNT);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("bad shape");
    const clean = parsed
      .filter((v): v is string => typeof v === "string")
      .slice(0, QUICK_PANEL_MAX);
    return clean.length > 0 ? clean : DEFAULT_QUICK_IDS.slice(0, QUICK_PANEL_DEFAULT_COUNT);
  } catch {
    return DEFAULT_QUICK_IDS.slice(0, QUICK_PANEL_DEFAULT_COUNT);
  }
}

/** Persist ids (capped at QUICK_PANEL_MAX). */
export function saveQuickIds(ids: string[]): void {
  if (typeof window === "undefined") return;
  const trimmed = ids.slice(0, QUICK_PANEL_MAX);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    window.dispatchEvent(new CustomEvent("cc-quick-panel-prefs-changed"));
  } catch {
    /* storage disabled — silently ignore */
  }
}
