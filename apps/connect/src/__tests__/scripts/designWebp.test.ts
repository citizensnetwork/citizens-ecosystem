/**
 * The WebP reader shared by the card validator and the encoder helper (Designer build, phase 3). It checks the
 * container, not only the `data:` prefix, because a label that says WebP above other bytes must fail.
 */
import { describe, it, expect } from "vitest";
import { parseWebpDataUrl, webpInfo } from "../../../scripts/design/webp.mjs";

const riff = (chunk: string, n = 40): Buffer => {
  const b = Buffer.alloc(n);
  b.write("RIFF", 0, "latin1");
  b.writeUInt32LE(n - 8, 4);
  b.write("WEBP", 8, "latin1");
  b.write(chunk, 12, "latin1");
  return b;
};
const url = (b: Buffer) => "data:image/webp;base64," + b.toString("base64");

describe("webpInfo", () => {
  it("reads the size of an extended (VP8X) file", () => {
    const b = riff("VP8X");
    b.writeUIntLE(479, 24, 3);
    b.writeUIntLE(299, 27, 3);
    expect(webpInfo(b)).toEqual({ ok: true, format: "VP8X", width: 480, height: 300 });
  });
  it("reads the size of a lossless (VP8L) file", () => {
    const b = riff("VP8L");
    b[20] = 0x2f;
    b.writeUInt32LE(((299 << 14) | 479) >>> 0, 21);
    expect(webpInfo(b)).toEqual({ ok: true, format: "VP8L", width: 480, height: 300 });
  });
  it("reads the size of a lossy (VP8) file, which is what a browser canvas writes", () => {
    const b = riff("VP8 ");
    b[23] = 0x9d;
    b[24] = 0x01;
    b[25] = 0x2a;
    b.writeUInt16LE(480, 26);
    b.writeUInt16LE(300, 28);
    expect(webpInfo(b)).toEqual({ ok: true, format: "VP8", width: 480, height: 300 });
  });
  it("rejects other containers, a short file, a cut-short file and an unknown chunk", () => {
    expect(webpInfo(Buffer.from("\x89PNG\r\n\x1a\n" + "x".repeat(40), "latin1")).ok).toBe(false);
    expect(webpInfo(Buffer.alloc(8)).ok).toBe(false);
    const cut = riff("VP8X");
    cut.writeUInt32LE(5000, 4);
    expect(webpInfo(cut)).toMatchObject({ ok: false });
    expect(webpInfo(riff("ABCD"))).toMatchObject({ ok: false });
  });
});

describe("parseWebpDataUrl", () => {
  it("reads a WebP data URL and reports the characters, the bytes and the size", () => {
    const b = riff("VP8X");
    b.writeUIntLE(319, 24, 3);
    b.writeUIntLE(199, 27, 3);
    const s = url(b);
    expect(parseWebpDataUrl(s)).toEqual({ ok: true, chars: s.length, bytes: 40, format: "VP8X", width: 320, height: 200 });
  });
  it.each([
    ["a non-string", 12],
    ["another media type", "data:image/png;base64,iVBORw0KGgo="],
    ["a web address", "https://example.org/a.webp"],
    ["a data URL that is not base64", "data:image/webp,abc"],
    ["bad base64 length", "data:image/webp;base64,abc"],
    ["bytes that are not a WebP", "data:image/webp;base64," + Buffer.from("not a webp file at all, only text").toString("base64")],
  ])("rejects %s", (_name, value) => {
    expect(parseWebpDataUrl(value).ok).toBe(false);
  });
});
