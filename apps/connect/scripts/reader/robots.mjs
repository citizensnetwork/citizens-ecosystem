// robots.txt (RFC 9309) for the Reader. Pure.
//
// The Reader identifies itself as "CitizensConnectReader". A group that names that product (or
// a prefix of it) wins over the "*" group. Within the chosen group the longest matching rule
// wins, and Allow beats Disallow on a tie. "*" matches any run of characters and a trailing
// "$" anchors the end.

export const ROBOTS_PRODUCT = "citizensconnectreader";

const MAX_LINES = 5_000;
const MAX_RULE_LENGTH = 500;

/** @returns {{ rules: {allow:boolean, pattern:string}[] }} the rules that apply to us */
export function parseRobots(text, product = ROBOTS_PRODUCT) {
  const groups = []; // { agents: string[], rules: [] }
  let current = null;
  let lastWasAgent = false;
  const lines = String(text ?? "").split(/\r\n|\n|\r/, MAX_LINES);
  for (const rawLine of lines) {
    const hash = rawLine.indexOf("#");
    const line = (hash === -1 ? rawLine : rawLine.slice(0, hash)).trim().slice(0, MAX_RULE_LENGTH);
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === "user-agent") {
      if (!lastWasAgent || !current) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === "allow" || field === "disallow") {
      if (value === "") continue; // "Disallow:" with nothing means allow everything
      current.rules.push({ allow: field === "allow", pattern: value });
    }
  }
  const named = groups.filter((g) => g.agents.some((a) => a !== "*" && a !== "" && product.startsWith(a)));
  const chosen = named.length ? named : groups.filter((g) => g.agents.includes("*"));
  return { rules: chosen.flatMap((g) => g.rules) };
}

/** Does `pattern` (with * and a trailing $) match the start of `path`? Iterative, so no regex blow-up. */
export function patternMatches(pattern, path) {
  let pat = pattern;
  let anchored = false;
  if (pat.endsWith("$")) {
    anchored = true;
    pat = pat.slice(0, -1);
  }
  const parts = pat.split("*");
  let pos = 0;
  if (!path.startsWith(parts[0])) return false;
  pos = parts[0].length;
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (i === parts.length - 1 && anchored) {
      if (part === "") return true;
      return path.length - pos >= part.length && path.endsWith(part);
    }
    const at = path.indexOf(part, pos);
    if (at === -1) return false;
    pos = at + part.length;
  }
  return anchored ? pos === path.length : true;
}

/** May the Reader fetch `pathAndQuery` ("/events?page=2")? */
export function isAllowed(parsed, pathAndQuery) {
  const path = pathAndQuery || "/";
  let best = null;
  for (const rule of parsed.rules) {
    if (!patternMatches(rule.pattern, path)) continue;
    if (
      best === null ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)
    ) {
      best = rule;
    }
  }
  return best === null ? true : best.allow;
}
