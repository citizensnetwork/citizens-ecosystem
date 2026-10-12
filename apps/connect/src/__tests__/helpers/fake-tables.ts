/**
 * A tiny in-memory stand-in for the Supabase query builder, for route tests that
 * must assert what is actually STORED rather than which calls were made.
 *
 * Supports the chains the automation routes use: select / eq / gte / limit,
 * insert / upsert (with ignoreDuplicates + onConflict) / update, and the
 * maybeSingle / single / awaited-array terminals. Not a database: no joins, no
 * ordering, string comparison for gte (fine for ISO timestamps).
 */

export type Row = Record<string, unknown>;

export function createFakeTables(tableNames: string[]) {
  const state: Record<string, Row[]> = Object.fromEntries(tableNames.map((t) => [t, [] as Row[]]));
  /** Tables whose next inserts fail, to exercise the error paths. */
  const failInsert = new Set<string>();
  let seq = 0;

  function from(table: string) {
    const eqs: [string, unknown][] = [];
    const gtes: [string, string][] = [];
    const ins: [string, unknown[]][] = [];
    let op: "select" | "insert" | "upsert" | "update" = "select";
    let payload: Row = {};
    let opts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
    let selected = false;
    let columns: string[] | null = null; // the select() list; null / "*" = every column

    // Like PostgREST: a select() list returns only those columns.
    const project = (row: Row): Row => (columns ? Object.fromEntries(columns.filter((c) => c in row).map((c) => [c, row[c]])) : row);

    const matching = () =>
      state[table].filter(
        (r) => eqs.every(([c, v]) => r[c] === v) && gtes.every(([c, v]) => String(r[c] ?? "") >= v) && ins.every(([c, vs]) => vs.includes(r[c])),
      );

    const run = (mode: "many" | "maybe" | "single") => {
      if (op === "select") {
        const rows = matching();
        if (mode === "single") return rows[0] ? { data: project(rows[0]), error: null } : { data: null, error: { message: "no rows" } };
        return { data: mode === "maybe" ? (rows[0] ? project(rows[0]) : null) : rows.map(project), error: null };
      }
      if (op === "update") {
        for (const r of matching()) Object.assign(r, payload);
        return { data: null, error: null };
      }
      if (failInsert.has(table)) return { data: null, error: { message: "boom" } };
      if (op === "upsert" && opts.ignoreDuplicates && opts.onConflict) {
        const cols = opts.onConflict.split(",");
        if (state[table].some((r) => cols.every((c) => r[c] === payload[c]))) return { data: [], error: null };
      }
      const row = { id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`, ...payload };
      state[table].push(row);
      return { data: selected ? (mode === "single" ? project(row) : [project(row)]) : null, error: null };
    };

    const b: Record<string, unknown> = {
      select: (cols?: string) => {
        selected = true;
        const list = typeof cols === "string" && cols.trim() !== "*" ? cols.split(",").map((c) => c.trim()).filter(Boolean) : null;
        if (list) columns = list;
        return b;
      },
      eq: (c: string, v: unknown) => (eqs.push([c, v]), b),
      gte: (c: string, v: string) => (gtes.push([c, v]), b),
      in: (c: string, vs: unknown[]) => (ins.push([c, vs]), b),
      limit: () => b,
      // ordering, paging and free-text filters are not modelled: they pass straight through
      order: () => b,
      range: () => b,
      or: () => b,
      insert: (p: Row) => ((op = "insert"), (payload = p), b),
      upsert: (p: Row, o: typeof opts) => ((op = "upsert"), (payload = p), (opts = o), b),
      update: (p: Row) => ((op = "update"), (payload = p), b),
      maybeSingle: () => Promise.resolve(run("maybe")),
      single: () => Promise.resolve(run("single")),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run("many")).then(res, rej),
    };
    return b;
  }

  return {
    state,
    from,
    failInsert,
    reset() {
      for (const t of tableNames) state[t] = [];
      failInsert.clear();
      seq = 0;
    },
  };
}
