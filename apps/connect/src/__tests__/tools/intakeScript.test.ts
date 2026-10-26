/**
 * tools/google-forms/intake.gs runs inside Google Apps Script, which nothing
 * in CI can execute. Its load-bearing logic is exercised here against stubbed
 * Google services — above all that the bytes it signs are exactly the bytes
 * the server verifies (non-ASCII answers like "Café" included).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHmac } from "node:crypto";
import { verifyIntakeSignature } from "@/lib/intake/googleForm";

const SECRET = "c".repeat(64);
const SRC = readFileSync(join(process.cwd(), "tools/google-forms/intake.gs"), "utf8");

type Script = {
  post_: (payload: unknown) => { code: number; body: Record<string, unknown> };
  columns_: (sheet: unknown) => Record<string, number>;
  buildPayload_: (str: (k: string) => string, notes: string[]) => Record<string, unknown>;
  autoUpdateLevel_: (answer: string, notes: string[]) => string;
  sendWelcome_: (email: string, name: string, url: string, onMap?: boolean, hasAccount?: boolean) => void;
  refreshStatuses: () => void;
  processRow_: (sheet: unknown, cols: Record<string, number>, row: number) => void;
  awaitingStatus_: (days: number, reminded: boolean) => string;
  isOpenStatus_: (status: string) => boolean;
  isFinishedStatus_: (status: string) => boolean;
  slugFromUrl_: (url: string) => string;
  setup: () => void;
  Q: Record<string, string>;
};

let fetchCalls: { url: string; opts: Record<string, unknown> }[];
let fetchReply: { code: number; text: string; headers?: Record<string, string> };
let sentMail: Record<string, string>[];
let lockReleased = false;
// What the stubbed Sheet / triggers did, for the C10 status poll and setup().
let lockTaken = true;
let toasts: string[];
let triggersMade: Array<{ fn: string; kind: string; minutes?: number; ss?: boolean }>;
let triggersDeleted: string[];
let existingTriggers: string[];

function load(): Script {
  const google = {
    Utilities: {
      // Apps Script returns Java-style SIGNED bytes.
      computeHmacSha256Signature: (value: string, key: string) =>
        Array.from(createHmac("sha256", key).update(value, "utf8").digest()).map((b) => (b > 127 ? b - 256 : b)),
      base64Encode: (bytes: number[]) => Buffer.from(bytes).toString("base64"),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) =>
          ({ INTAKE_URL: "https://www.citizenscentral.co.za/api/intake/google-form", INTAKE_SECRET: SECRET })[k] ?? null,
      }),
    },
    UrlFetchApp: {
      fetch: (url: string, opts: Record<string, unknown>) => {
        fetchCalls.push({ url, opts });
        return {
          getResponseCode: () => fetchReply.code,
          getContentText: () => fetchReply.text,
          getHeaders: () => fetchReply.headers ?? {},
        };
      },
    },
    DriveApp: {
      getFileById: (id: string) => ({
        getSize: () => 4,
        getBlob: () => ({ getBytes: () => [0x89, 0x50, 0x4e, id.length], getContentType: () => "image/png" }),
      }),
    },
    Maps: {
      newGeocoder: () => ({
        setRegion: () => ({
          geocode: () => ({ status: "OK", results: [{ geometry: { location: { lat: -26.1, lng: 27.9 } } }] }),
        }),
      }),
    },
    MailApp: { sendEmail: (m: Record<string, string>) => sentMail.push(m) },
    ScriptApp: {
      getOAuthToken: () => "token",
      getProjectTriggers: () => existingTriggers.map((fn) => ({ getHandlerFunction: () => fn, id: fn })),
      deleteTrigger: (t: { id: string }) => triggersDeleted.push(t.id),
      newTrigger: (fn: string) => {
        const t: { fn: string; kind: string; minutes?: number; ss?: boolean } = { fn, kind: "" };
        const b = {
          forSpreadsheet: () => { t.ss = true; return b; },
          onEdit: () => { t.kind = "edit"; return b; },
          timeBased: () => { t.kind = "time"; return b; },
          everyMinutes: (m: number) => { t.minutes = m; return b; },
          create: () => { triggersMade.push({ ...t }); return b; },
        };
        return b;
      },
    },
    SpreadsheetApp: { flush: () => {}, getActive: () => ({ toast: (m: string) => toasts.push(m), getSheetByName: () => theSheet }) },
    LockService: {
      getScriptLock: () => ({ tryLock: () => lockTaken, releaseLock: () => { lockReleased = true; } }),
    },
    Logger: { log: vi.fn() },
  };
  const names = Object.keys(google);
  const factory = new Function(
    ...names,
    `${SRC}\nreturn { post_, columns_, buildPayload_, autoUpdateLevel_, sendWelcome_, refreshStatuses, processRow_, awaitingStatus_, isOpenStatus_, isFinishedStatus_, slugFromUrl_, setup, Q };`,
  );
  return factory(...names.map((n) => google[n as keyof typeof google])) as Script;
}

// A Sheet whose cells we can read and watch being written (one header row, then the data rows).
type Cell = { v: unknown };
let theSheet: ReturnType<typeof makeSheet>;
function makeSheet(headers: string[], rows: unknown[][]) {
  const grid: Cell[][] = [headers, ...rows].map((r) => r.map((v) => ({ v })));
  const writes: Array<{ row: number; col: number; value: unknown }> = [];
  const range = (r: number, c: number, nr = 1, nc = 1) => ({
    getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => grid[r - 1 + i]?.[c - 1 + j]?.v ?? "")),
    getValue: () => grid[r - 1]?.[c - 1]?.v ?? "",
    setValue: (value: unknown) => {
      (grid[r - 1] ??= [])[c - 1] = { v: value };
      writes.push({ row: r, col: c, value });
    },
  });
  return { getRange: range, getLastRow: () => grid.length, getLastColumn: () => headers.length, getName: () => "Form Responses 1", writes, grid };
}

beforeEach(() => {
  fetchCalls = [];
  sentMail = [];
  fetchReply = { code: 200, text: '{"success":true}' };
  lockTaken = true;
  lockReleased = false;
  toasts = [];
  triggersMade = [];
  triggersDeleted = [];
  existingTriggers = [];
  theSheet = makeSheet(["x"], []);
});

describe("intake.gs → server signature compatibility", () => {
  it("signs a pure-ASCII body the server accepts, and non-ASCII survives the round trip", () => {
    const script = load();
    const name = "Café Ümlaut — Kingdom Table 🎉";
    script.post_({ organisation_name: name });

    const { url, opts } = fetchCalls[0];
    expect(url).toBe("https://www.citizenscentral.co.za/api/intake/google-form");
    const body = opts.payload as string;
    expect(/^[\x00-\x7f]*$/.test(body)).toBe(true);
    expect(JSON.parse(body).organisation_name).toBe(name);

    const headers = opts.headers as Record<string, string>;
    expect(
      verifyIntakeSignature({
        secret: SECRET,
        timestamp: headers["X-Intake-Timestamp"],
        signature: headers["X-Intake-Signature"],
        body,
        nowSeconds: Math.floor(Date.now() / 1000),
      }),
    ).toBe(true);
    expect(opts.followRedirects).toBe(false);
  });

  it("explains a redirecting INTAKE_URL instead of failing silently", () => {
    fetchReply = { code: 308, text: "" };
    expect(load().post_({}).body.error).toBe("redirect");
  });
});

describe("intake.gs row handling", () => {
  const sheetWith = (headers: string[]) => ({
    getLastColumn: () => headers.length,
    getRange: () => ({ getValues: () => [headers] }),
  });
  // A Form header as Google writes it: "Question N.N: <wording>".
  const questionHeaders = (script: Script) =>
    Object.values(script.Q).map((phrase, i) => `Question ${Math.floor(i / 4) + 1}.${(i % 4) + 1}: ${phrase} (extra words)`);
  const MANUAL = ["Approve", "Status", "Listing URL", "Processed at", "Notes"];

  it("finds each question by its WORDING, wherever it sits, and names missing manual headers", () => {
    const script = load();
    const headers = questionHeaders(script);
    const cols = script.columns_(sheetWith(["Timestamp", ...[...headers].reverse(), ...MANUAL]));
    expect(cols[script.Q.category]).toBeGreaterThan(1);
    expect(cols.Approve).toBe(headers.length + 2);
    expect(() => script.columns_(sheetWith(["Timestamp", ...headers]))).toThrow(/Approve/);

    // The founder's real Sheet says "Processed At" — capitals/spacing must not matter.
    const relaxed = script.columns_(
      sheetWith(["Timestamp", ...headers, " approve ", "STATUS", "Listing  URL", "Processed At", "notes"]),
    );
    expect(relaxed["Processed at"]).toBe(headers.length + 5);
    expect(relaxed.Approve).toBe(headers.length + 2);
  });

  it("is not fooled by renumbering: reordering a section keeps every answer on its own question", () => {
    // 2026-10-02 regression: Section 7 was reordered, so "Question 7.4" and "7.5" held other
    // questions. Match on the wording and the numbers are irrelevant.
    const script = load();
    const renumbered = questionHeaders(script).map((h) => h.replace(/^Question \d+\.\d+:/, "Question 7.9:"));
    const cols = script.columns_(sheetWith(["Timestamp", ...renumbered, ...MANUAL]));
    expect(cols[script.Q.faith]).not.toBe(cols[script.Q.permission]);
    expect(cols[script.Q.permission]).toBe(renumbered.findIndex((h) => h.includes(script.Q.permission)) + 2);
  });

  it("refuses a question that is missing or matches more than one column, naming it", () => {
    const script = load();
    const headers = questionHeaders(script);
    const without = headers.filter((h) => !h.includes(script.Q.permission));
    expect(() => script.columns_(sheetWith(["Timestamp", ...without, ...MANUAL]))).toThrow(
      new RegExp(`no question containing "${script.Q.permission}"`),
    );
    // "Website" must not silently bind to a second question that merely contains the word.
    const twice = [...headers, `Question 9.9: ${script.Q.permission} (again)`];
    expect(() => script.columns_(sheetWith(["Timestamp", ...twice, ...MANUAL]))).toThrow(/matches 2 questions/);
  });

  it("builds the payload from raw answers: consents as booleans, first Drive file, geocode hint", () => {
    const script = load();
    const answers: Record<string, string> = {
      [script.Q.ownerEmail]: "lerato@hopeharvest.org.za",
      [script.Q.name]: "Hope Harvest Outreach",
      [script.Q.type]: "Christian Nonprofit / Ministry",
      [script.Q.category]: "Outreach / Mission",
      [script.Q.fixed]: "Yes",
      [script.Q.address]: "1 Main Road, Soweto",
      [script.Q.maps]: "https://maps.google.com/?q=1+Main+Road",
      [script.Q.faith]: "Christian — interdenominational",
      [script.Q.permission]: "Yes",
      [script.Q.logo]: "https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp, https://drive.google.com/open?id=2ZZZZZZZZZZZZ",
      [script.Q.cover]: "Sunday congregation worshipping",
    };
    const notes: string[] = [];
    const payload = script.buildPayload_((k) => answers[k] ?? "", notes);

    expect(payload).toMatchObject({
      owner_email: "lerato@hopeharvest.org.za",
      organisation_type: "Christian Nonprofit / Ministry",
      faith_alignment: true,
      permission_to_publish: true,
      geocoded: { lat: -26.1, lng: 27.9 },
      // First file only; the stub encodes the id's length ("1AbCdEfGhIjKlMnOp" = 17) as the last byte.
      logo: { mime: "image/png", base64: Buffer.from([0x89, 0x50, 0x4e, 17]).toString("base64") },
      cover: null,
    });
    expect(notes).toEqual(["Cover photo skipped: no Drive file link in the cell."]);

    const refused = script.buildPayload_((k) => (k === script.Q.permission ? "No" : answers[k] ?? ""), []);
    expect(refused.permission_to_publish).toBe(false);
  });

  it("sends the listing-update consent level, defaulting to off", () => {
    const script = load();
    const levelFor = (answer: string) => {
      const notes: string[] = [];
      const payload = script.buildPayload_((k) => (k === script.Q.autoUpdate ? answer : ""), notes);
      return { level: payload.auto_update, echoed: payload.auto_update_answer, notes };
    };
    expect(levelFor("").level).toBe("off");
    // A plain "no" is a clean answer: off, and nothing for the admin to double-check.
    expect(levelFor("No thanks")).toMatchObject({ level: "off", notes: [] });
    expect(levelFor("Yes, suggest updates for my approval").level).toBe("suggest");
    expect(levelFor("Yes, and publish events automatically").level).toBe("events_auto");
    // An answer nobody planned for is treated as NO consent, and the row says so.
    const odd = levelFor("Perhaps later");
    expect(odd.level).toBe("off");
    expect(odd.notes[0]).toMatch(/Unrecognised .*stored as off/);
    expect(odd.echoed).toBe("Perhaps later");
  });

  it("escapes applicant-supplied text in the welcome email", () => {
    load().sendWelcome_("a@b.co", '<script>alert("x")</script> Church', "https://www.citizenscentral.co.za/c/church");
    expect(sentMail).toHaveLength(1);
    expect(sentMail[0].htmlBody).not.toContain("<script>");
    expect(sentMail[0].htmlBody).toContain("&lt;script&gt;");
    expect(sentMail[0].htmlBody).toContain("https://www.citizenscentral.co.za/dashboard");
    expect(sentMail[0].to).toBe("a@b.co");
  });

  it("says 'on the map' in the welcome only when Connect reported a pin (C21); Kingdom Discovery always", () => {
    const url = "https://www.citizenscentral.co.za/c/church";
    load().sendWelcome_("a@b.co", "Grace Church", url, true);
    expect(sentMail[0].htmlBody).toContain("you're now on the map and in Kingdom Discovery,");
    sentMail.length = 0;
    // no pin, or Connect did not say (an older server): never the map
    for (const onMap of [false, undefined]) {
      load().sendWelcome_("a@b.co", "Grace Church", url, onMap);
      const mail = sentMail.pop()!;
      expect(mail.htmlBody).toContain("you're now in Kingdom Discovery,");
      expect(mail.htmlBody).not.toContain("on the map");
      expect(mail.body).not.toContain("on the map");
    }
  });

  it("passes the server's on_map and owner_has_account answers to the welcome, and only an exact true counts", () => {
    // the call site in processRow_ reads res.body.on_map === true (the Sheet cannot run here, so the source is pinned)
    expect(SRC).toContain(
      "sendWelcome_(payload.owner_email, payload.organisation_name, res.body.url, res.body.on_map === true, res.body.owner_has_account === true);",
    );
  });

  it("the welcome asks the new owner to CONFIRM the listing, in words that match the server's email", () => {
    load().sendWelcome_("a@b.co", "Grace Church", "https://www.citizenscentral.co.za/c/church", true);
    const mail = sentMail[0];
    for (const part of [mail.htmlBody, mail.body]) {
      expect(part).toContain("confirm the listing is yours");
      expect(part).toContain("Not me");
      expect(part).not.toContain("land on your Contributor dashboard");
      expect(part).not.toContain("Attach");
    }
    expect(mail.body).toContain("we will ask you to confirm that this listing is yours");
  });

  it("the welcome for an owner who already has an account offers the attach and promises nothing changes unless they confirm", () => {
    load().sendWelcome_("a@b.co", "Grace Church", "https://www.citizenscentral.co.za/c/church", true, true);
    const mail = sentMail[0];
    for (const part of [mail.htmlBody, mail.body]) {
      expect(part).toContain("already have a Citizens Connect account with");
      expect(part).toContain("Attach Grace Church to your account?");
      expect(part).toContain("Nothing on your account changes unless you tap");
    }
    // only an exact true counts
    sentMail.length = 0;
    load().sendWelcome_("a@b.co", "Grace Church", "https://www.citizenscentral.co.za/c/church", true, undefined);
    expect(sentMail[0].body).not.toContain("Attach");
  });

  it("escapes the organisation's name inside the attach question", () => {
    load().sendWelcome_("a@b.co", '<img src=x onerror="alert(1)">', "https://www.citizenscentral.co.za/c/x", true, true);
    expect(sentMail[0].htmlBody).not.toContain("<img");
    expect(sentMail[0].htmlBody).toContain("&lt;img");
  });
});

// ── C10: the Status column follows the database ─────────────────────────────

describe("intake.gs Status (C10)", () => {
  const MANUAL = ["Approve", "Status", "Listing URL", "Processed at", "Notes"];
  const questionHeaders = (script: Script) => Object.values(script.Q).map((phrase, i) => `Question ${Math.floor(i / 4) + 1}.${(i % 4) + 1}: ${phrase}`);
  const COL = { Approve: 0, Status: 0, "Listing URL": 0, Notes: 0 } as Record<string, number>;

  /** A Sheet with the Form's columns, the five manual ones, and the given rows of [status, listing url, notes]. */
  function sheetWithRows(script: Script, rows: Array<[string, string, string]>) {
    const headers = ["Timestamp", ...questionHeaders(script), ...MANUAL];
    const base = headers.length - MANUAL.length;
    COL.Approve = base + 1;
    COL.Status = base + 2;
    COL["Listing URL"] = base + 3;
    COL.Notes = base + 5;
    const data = rows.map(([status, url, notes]) => {
      const r: unknown[] = new Array(headers.length).fill("");
      r[base] = true; // Approve
      r[base + 1] = status;
      r[base + 2] = url;
      r[base + 4] = notes;
      return r;
    });
    theSheet = makeSheet(headers, data);
    return theSheet;
  }
  const url = (slug: string) => `https://www.citizenscentral.co.za/c/${slug}`;
  const statusWrites = () => theSheet.writes.filter((w) => w.col === COL.Status).map((w) => [w.row, w.value]);
  const reply = (statuses: Record<string, unknown>) => { fetchReply = { code: 200, text: JSON.stringify({ statuses }) }; };

  it("labels: age in words, '(reminded)' after the single reminder, and which statuses count as open or finished", () => {
    const script = load();
    expect(script.awaitingStatus_(0, false)).toBe("Awaiting owner · today");
    expect(script.awaitingStatus_(1, false)).toBe("Awaiting owner · 1 day");
    expect(script.awaitingStatus_(3, false)).toBe("Awaiting owner · 3 days");
    expect(script.awaitingStatus_(8, true)).toBe("Awaiting owner · 8 days (reminded)");
    expect(script.awaitingStatus_(-2, false)).toBe("Awaiting owner · today");
    expect(script.isOpenStatus_("Awaiting owner · 3 days")).toBe(true);
    for (const done of ["Owner confirmed ✓", "Owner declined", "Live ✓", "Error", ""]) expect(script.isOpenStatus_(done)).toBe(false);
    for (const done of ["Live ✓", "Processing…", "Awaiting owner · 2 days", "Owner confirmed ✓", "Owner declined"]) expect(script.isFinishedStatus_(done)).toBe(true);
    for (const open of ["", "Error"]) expect(script.isFinishedStatus_(open)).toBe(false);
  });

  it("reads the slug from the end of a listing link, and nothing else", () => {
    const script = load();
    expect(script.slugFromUrl_(url("grace-point"))).toBe("grace-point");
    expect(script.slugFromUrl_(url("grace-point") + "/")).toBe("grace-point");
    for (const bad of ["", "https://x.test/", "https://x.test/c/", "https://x.test/c/Bad Slug", "https://x.test/c/a/b", "not a url", null]) {
      expect(script.slugFromUrl_(bad as string), String(bad)).toBe("");
    }
  });

  it("a row that already has any Status is never sent to Connect again (no double listing, no second welcome)", () => {
    const script = load();
    const sheet = sheetWithRows(script, [["Awaiting owner · 2 days", url("a"), ""], ["Owner confirmed ✓", url("b"), ""], ["Owner declined", url("c"), ""], ["Live ✓", url("d"), ""]]);
    const cols = script.columns_(sheet);
    for (let row = 2; row <= 5; row++) script.processRow_(sheet, cols, row);
    expect(fetchCalls).toHaveLength(0);
    expect(sheet.writes).toHaveLength(0);
  });

  it("after a successful approval the row says 'Awaiting owner · today', and the welcome uses owner_has_account", () => {
    const script = load();
    const sheet = sheetWithRows(script, [["", "", ""]]);
    const cols = script.columns_(sheet);
    // fill the questions the server needs; the stub server only looks at the reply
    const rowIdx = 2;
    sheet.getRange(rowIdx, cols[script.Q.ownerEmail]).setValue("owner@example.com");
    sheet.getRange(rowIdx, cols[script.Q.name]).setValue("Grace Church");
    fetchReply = { code: 200, text: JSON.stringify({ success: true, url: url("grace-church"), on_map: true, owner_has_account: true, awaiting_owner: true, warnings: [] }) };
    sheet.writes.length = 0;
    script.processRow_(sheet, cols, rowIdx);
    expect(statusWrites().at(-1)).toEqual([2, "Awaiting owner · today"]);
    expect(sentMail).toHaveLength(1);
    expect(sentMail[0].body).toContain("Attach Grace Church to your account?");
  });

  it("refreshStatuses asks Connect (signed, to /status) only for rows still awaiting, and writes what the database says", () => {
    const script = load();
    sheetWithRows(script, [
      ["Awaiting owner · today", url("grace"), ""],
      ["Awaiting owner · 1 day", url("hope"), ""],
      ["Owner confirmed ✓", url("done"), ""],
      ["Live ✓", url("old"), ""],
      ["Error", "", ""],
      ["Awaiting owner · 2 days", url("mercy"), ""],
    ]);
    reply({
      grace: { status: "awaiting", age_days: 3, reminded: false },
      hope: { status: "confirmed", age_days: 2, reminded: true },
      mercy: { status: "declined", age_days: 4, reminded: false },
    });
    script.refreshStatuses();

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe("https://www.citizenscentral.co.za/api/intake/google-form/status");
    const sent = JSON.parse(fetchCalls[0].opts.payload as string);
    expect(sent).toEqual({ slugs: ["grace", "hope", "mercy"] });
    const headers = fetchCalls[0].opts.headers as Record<string, string>;
    expect(
      verifyIntakeSignature({ secret: SECRET, timestamp: headers["X-Intake-Timestamp"], signature: headers["X-Intake-Signature"], body: fetchCalls[0].opts.payload as string, nowSeconds: Math.floor(Date.now() / 1000) }),
    ).toBe(true);

    expect(statusWrites()).toEqual([
      [2, "Awaiting owner · 3 days"],
      [3, "Owner confirmed ✓"],
      [7, "Owner declined"],
    ]);
    // "Not me" leaves the admin a note on what to do
    const note = theSheet.writes.find((w) => w.row === 7 && w.col === COL.Notes);
    expect(String(note?.value)).toContain("Decide in Admin → Listings whether to Delete it");
    expect(lockReleased).toBe(true);
  });

  it("shows '(reminded)' once the 7-day reminder has gone out", () => {
    const script = load();
    sheetWithRows(script, [["Awaiting owner · 7 days", url("grace"), ""]]);
    reply({ grace: { status: "awaiting", age_days: 8, reminded: true } });
    script.refreshStatuses();
    expect(statusWrites()).toEqual([[2, "Awaiting owner · 8 days (reminded)"]]);
  });

  it("never writes when nothing changed, and leaves a slug Connect does not know alone", () => {
    const script = load();
    sheetWithRows(script, [["Awaiting owner · 3 days", url("grace"), ""], ["Awaiting owner · 5 days", url("gone"), ""]]);
    reply({ grace: { status: "awaiting", age_days: 3, reminded: false } });
    script.refreshStatuses();
    expect(theSheet.writes).toHaveLength(0);
  });

  it("is READ-ONLY toward Connect: it only ever POSTs to /status and sends nothing but slugs", () => {
    const script = load();
    sheetWithRows(script, [["Awaiting owner · today", url("grace"), ""]]);
    reply({ grace: { status: "confirmed", age_days: 0, reminded: false } });
    script.refreshStatuses();
    expect(fetchCalls.every((c) => c.url.endsWith("/api/intake/google-form/status"))).toBe(true);
    expect(Object.keys(JSON.parse(fetchCalls[0].opts.payload as string))).toEqual(["slugs"]);
    expect(sentMail).toHaveLength(0);
  });

  it("a confirmed or declined row is final: editing the Sheet cannot send it back to Connect or change what Connect holds", () => {
    const script = load();
    sheetWithRows(script, [["Owner confirmed ✓", url("grace"), ""], ["Owner declined", url("hope"), ""]]);
    script.refreshStatuses();
    expect(fetchCalls).toHaveLength(0);
  });

  it("if the founder changed a cell while the poll was away, the poll does not overwrite it", () => {
    const script = load();
    const sheet = sheetWithRows(script, [["Awaiting owner · today", url("grace"), ""]]);
    reply({ grace: { status: "confirmed", age_days: 0, reminded: false } });
    const realGetRange = sheet.getRange;
    // the Status cell is edited by hand between the read and the write
    sheet.getRange = (r: number, c: number, nr?: number, nc?: number) => {
      const range = realGetRange(r, c, nr, nc);
      if (r === 2 && c === COL.Status && nr === undefined) {
        const original = range.getValue;
        let calls = 0;
        range.getValue = () => (++calls === 1 ? "Error" : original());
      }
      return range;
    };
    script.refreshStatuses();
    expect(statusWrites()).toEqual([]);
  });

  it("skips quietly when Connect is unreachable or answers an error (the next run catches up)", () => {
    const script = load();
    sheetWithRows(script, [["Awaiting owner · today", url("grace"), ""]]);
    for (const r of [{ code: 500, text: '{"error":"status_failed"}' }, { code: 401, text: '{"error":"unauthorized"}' }, { code: 200, text: "not json" }]) {
      fetchReply = r;
      theSheet.writes.length = 0;
      expect(() => script.refreshStatuses()).not.toThrow();
      expect(theSheet.writes).toHaveLength(0);
    }
  });

  it("does nothing while a row is being approved (no lock), and releases the lock when it does run", () => {
    const script = load();
    sheetWithRows(script, [["Awaiting owner · today", url("grace"), ""]]);
    lockTaken = false;
    script.refreshStatuses();
    expect(fetchCalls).toHaveLength(0);
    lockTaken = true;
    reply({ grace: { status: "awaiting", age_days: 0, reminded: false } });
    script.refreshStatuses();
    expect(lockReleased).toBe(true);
  });

  it("asks in batches of 200 slugs", () => {
    const script = load();
    sheetWithRows(script, Array.from({ length: 450 }, (_, i): [string, string, string] => ["Awaiting owner · today", url(`listing-${i}`), ""]));
    reply({});
    script.refreshStatuses();
    expect(fetchCalls.map((c) => JSON.parse(c.opts.payload as string).slugs.length)).toEqual([200, 200, 50]);
  });

  it("setup() installs the approve trigger AND a 10-minute status poll, replacing old copies instead of doubling them", () => {
    existingTriggers = ["onApproveEdit", "refreshStatuses", "somethingElse"];
    const script = load();
    // setup() checks the manual headers and the Script properties; give it a Sheet that has them
    const headers = ["Timestamp", ...questionHeaders(script), ...MANUAL];
    theSheet = makeSheet(headers, []);
    script.setup();
    expect(triggersDeleted.sort()).toEqual(["onApproveEdit", "refreshStatuses"]);
    expect(triggersMade).toEqual([
      { fn: "onApproveEdit", kind: "edit", ss: true },
      { fn: "refreshStatuses", kind: "time", minutes: 10 },
    ]);
    expect(toasts.join(" ")).toMatch(/Intake is ready/);
  });

  it("the trigger handler is a public name (Apps Script cannot run a private one on a timer)", () => {
    expect(SRC).toMatch(/^function refreshStatuses\(\)/m);
    expect(SRC).not.toMatch(/function refreshStatuses_/);
  });
});
