// robots.txt (RFC 9309) for the Reader. Pure.
//
// The Reader's product token is "CitizensConnectReader". A group that names exactly that token
// (case-insensitive) wins over the "*" group; groups naming the same agent are merged. Within the
// chosen group the longest matching rule wins, and Allow wins a tie. "*" matches any run of
// characters and a trailing "$" anchors the end. Matching is a linear scan, never a regex built
// from the file, so a hostile robots.txt cannot make it slow.

export const ROBOTS_PRODUCT = "citizensconnectreader";

const MAX_LINES = 5_000;
const MAX_RULES = 2_000;
const MAX_RULE_LENGTH = 500;

/** The agent a user-agent line names: "CitizensConnectReader/1.0 (x)" -> "citizensconnectreader". */
function agentToken(value) {
  const t = value.trim().toLowerCase();
  if (t === "*") return "*";
  let end = 0;
  while (end < t.length && /[a-z_-]/.test(t[end])) end++;
  return t.slice(0, end);
}

/** @returns {{ rules: { allow: boolean, pattern: string }[] }} the rules that apply to the Reader */
export function parseRobots(text, product = ROBOTS_PRODUCT) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  const lines = String(text ?? "").split(/\r\n|\n|\r/, MAX_LINES);
  for (const rawLine of lines) {
    const hash = rawLine.indexOf("#");
    const line = (hash === -1 ? rawLine : rawLine.slice(0, hash)).trim();
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim().slice(0, MAX_RULE_LENGTH);
    if (field === "user-agent") {
      if (!lastWasAgent || !current) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(agentToken(value));
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current || (field !== "allow" && field !== "disallow")) continue;
    if (value === "") continue; // "Disallow:" with nothing disallows nothing
    if (current.rules.length < MAX_RULES) current.rules.push({ allow: field === "allow", pattern: value });
  }
  const named = groups.filter((g) => g.agents.includes(product));
  const chosen = named.length ? named : groups.filter((g) => g.agents.includes("*"));
  return { rules: chosen.flatMap((g) => g.rules) };
}

/** Does `pattern` (with * and a trailing $) match `path` from its start? */
export function patternMatches(pattern, path) {
  let pat = pattern;
  let anchored = false;
  if (pat.endsWith("$")) {
    anchored = true;
    pat = pat.slice(0, -1);
  }
  const parts = pat.split("*");
  if (!path.startsWith(parts[0])) return false;
  if (parts.length === 1) return anchored ? path.length === parts[0].length : true;
  let pos = parts[0].length;
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const last = i === parts.length - 1;
    if (last && anchored) return path.length - pos >= part.length && path.endsWith(part);
    if (part === "") continue;
    const at = path.indexOf(part, pos);
    if (at === -1) return false;
    pos = at + part.length;
  }
  return true;
}

/** May the Reader fetch `pathAndQuery` ("/events?page=2")? */
export function isAllowed(parsed, pathAndQuery) {
  const path = pathAndQuery || "/";
  let best = null;
  for (const rule of parsed.rules) {
    if (!patternMatches(rule.pattern, path)) continue;
    if (best === null || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)) {
      best = rule;
    }
  }
  return best === null ? true : best.allow;
}
