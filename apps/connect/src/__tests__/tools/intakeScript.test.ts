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
  sendWelcome_: (email: string, name: string, url: string) => void;
  Q: Record<string, string>;
};

let fetchCalls: { url: string; opts: Record<string, unknown> }[];
let fetchReply: { code: number; text: string; headers?: Record<string, string> };
let sentMail: Record<string, string>[];

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
    ScriptApp: { getOAuthToken: () => "token" },
    SpreadsheetApp: {},
    LockService: {},
    Logger: { log: vi.fn() },
  };
  const names = Object.keys(google);
  const factory = new Function(
    ...names,
    `${SRC}\nreturn { post_, columns_, buildPayload_, autoUpdateLevel_, sendWelcome_, Q };`,
  );
  return factory(...names.map((n) => google[n as keyof typeof google])) as Script;
}

beforeEach(() => {
  fetchCalls = [];
  sentMail = [];
  fetchReply = { code: 200, text: '{"success":true}' };
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
});
