import { describe, it, expect } from "vitest";
import {
  encodeCursor,
  decodeCursor,
  parsePageSize,
  buildCursorPage,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "@/lib/pagination/cursor";

describe("cursor pagination", () => {
  describe("encodeCursor / decodeCursor", () => {
    it("roundtrips a string sort key", () => {
      const payload = { k: "2025-01-15", i: "abc-123" };
      const encoded = encodeCursor(payload);
      expect(decodeCursor(encoded)).toEqual(payload);
    });

    it("roundtrips a numeric sort key", () => {
      const payload = { k: 1_700_000_000, i: "xyz" };
      const encoded = encodeCursor(payload);
      expect(decodeCursor(encoded)).toEqual(payload);
    });

    it("produces a URL-safe string (no +, /, = padding)", () => {
      const encoded = encodeCursor({ k: "??&=+/", i: "a" });
      expect(encoded).not.toMatch(/[+/=]/);
    });

    it("returns null for undefined / empty input", () => {
      expect(decodeCursor(null)).toBeNull();
      expect(decodeCursor(undefined)).toBeNull();
      expect(decodeCursor("")).toBeNull();
    });

    it("returns null for malformed base64", () => {
      expect(decodeCursor("!!!not-base64!!!")).toBeNull();
    });

    it("returns null when payload shape is wrong", () => {
      const bogus = Buffer.from(
        JSON.stringify({ wrong: "shape" }),
        "utf8",
      ).toString("base64url");
      expect(decodeCursor(bogus)).toBeNull();
    });

    it("returns null when `k` is a non-primitive value", () => {
      const bogus = Buffer.from(
        JSON.stringify({ k: { nested: true }, i: "x" }),
        "utf8",
      ).toString("base64url");
      expect(decodeCursor(bogus)).toBeNull();
    });
  });

  describe("parsePageSize", () => {
    it("returns default when input is missing", () => {
      expect(parsePageSize(null)).toBe(DEFAULT_PAGE_SIZE);
      expect(parsePageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
    });

    it("returns default for non-numeric input", () => {
      expect(parsePageSize("abc")).toBe(DEFAULT_PAGE_SIZE);
    });

    it("returns default for zero or negative input", () => {
      expect(parsePageSize("0")).toBe(DEFAULT_PAGE_SIZE);
      expect(parsePageSize("-5")).toBe(DEFAULT_PAGE_SIZE);
    });

    it("clamps to MAX_PAGE_SIZE", () => {
      expect(parsePageSize("999")).toBe(MAX_PAGE_SIZE);
    });

    it("passes through valid values", () => {
      expect(parsePageSize("25")).toBe(25);
    });
  });

  describe("buildCursorPage", () => {
    type Row = { id: string; date: string };
    const k = (r: Row) => r.date;
    const id = (r: Row) => r.id;

    it("returns null next_cursor when rows fit exactly in one page", () => {
      const rows: Row[] = [
        { id: "a", date: "2025-01-03" },
        { id: "b", date: "2025-01-02" },
      ];
      const page = buildCursorPage(rows, 5, k, id);
      expect(page.data).toEqual(rows);
      expect(page.next_cursor).toBeNull();
      expect(page.page_size).toBe(5);
    });

    it("truncates to pageSize and emits next_cursor when an extra row is present", () => {
      const rows: Row[] = [
        { id: "a", date: "2025-01-05" },
        { id: "b", date: "2025-01-04" },
        { id: "c", date: "2025-01-03" }, // sentinel extra row
      ];
      const page = buildCursorPage(rows, 2, k, id);
      expect(page.data).toHaveLength(2);
      expect(page.data[0].id).toBe("a");
      expect(page.data[1].id).toBe("b");
      expect(page.next_cursor).not.toBeNull();

      // The next cursor should encode the last-kept row's sort key + id.
      const decoded = decodeCursor(page.next_cursor);
      expect(decoded).toEqual({ k: "2025-01-04", i: "b" });
    });

    it("handles an empty result set gracefully", () => {
      const page = buildCursorPage<Row>([], 10, k, id);
      expect(page.data).toEqual([]);
      expect(page.next_cursor).toBeNull();
    });
  });
});
