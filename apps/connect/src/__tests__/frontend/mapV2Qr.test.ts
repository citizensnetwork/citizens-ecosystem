/**
 * Map v2 QR code encoder (`src/frontend/app/map-v2-qr.jsx`, tracker P2-06, no new dependency).
 *
 * How we know it is right: every symbol it makes was decoded back with an independent reader
 * (jsQR 1.4.0, run once from a scratch folder, never a dependency): 219 of 219 texts, versions 1 to 10,
 * plain ASCII and multi-byte UTF-8, the evidence is `docs/audit/data/p2-06-qr-decode-check.json`.
 * This file keeps that result from drifting: the structural rules of the standard (finder and timing
 * patterns, the BCH-checked format bits, the capacity edges) plus "golden" hashes of four symbols that
 * were among those decoded. A change to the encoder that alters any module of a golden symbol fails
 * here and must be re-verified with a decoder before the hashes are updated.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createHash } from "node:crypto";
import { loadFrontend } from "./support/loadFrontend";

type Qr = { version: number; size: number; modules: boolean[][] };
type Api = { encode: (t: string) => Qr | null; pathData: (q: Qr, quiet?: number) => { size: number; d: string }; MAX_BYTES: number };
let Q: Api;
beforeAll(() => {
  const win: Record<string, unknown> = {};
  loadFrontend("map-v2-qr.jsx", win);
  Q = win.MapV2QR as Api;
});

const hash = (q: Qr) => createHash("sha256").update(q.modules.map((r) => r.map((d) => (d ? "1" : "0")).join("")).join("\n")).digest("hex");

describe("capacity and version choice (level M, byte mode)", () => {
  it("holds up to 213 bytes and returns null past that, rather than a wrong code", () => {
    expect(Q.MAX_BYTES).toBe(213);
    expect(Q.encode("x".repeat(213))).not.toBeNull();
    expect(Q.encode("x".repeat(214))).toBeNull();
  });

  it("picks the smallest version that fits", () => {
    const v = (n: number) => Q.encode("x".repeat(n))!.version;
    expect([v(1), v(14), v(15), v(26), v(27), v(42), v(43), v(62), v(63), v(84), v(85), v(106), v(107), v(122), v(123), v(152), v(153), v(180), v(181), v(213)])
      .toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10]);
  });

  it("counts bytes, not characters (UTF-8)", () => {
    expect(Q.encode("é".repeat(7))!.version).toBe(1);   // 14 bytes
    expect(Q.encode("é".repeat(8))!.version).toBe(2);   // 16 bytes
  });

  it("encodes the empty string and does not throw on odd input", () => {
    expect(Q.encode("")!.version).toBe(1);
    expect(Q.encode(undefined as unknown as string)!.version).toBe(1);
  });
});

describe("structure: the fixed patterns of the standard", () => {
  const texts = ["https://www.citizenscentral.co.za/c/example-fellowship", "a", "x".repeat(150)];
  for (const text of texts) {
    const q = () => Q.encode(text)!;

    it(`size is 17 + 4 x version, and the symbol is square (${text.length} bytes)`, () => {
      const c = q();
      expect(c.size).toBe(17 + 4 * c.version);
      expect(c.modules).toHaveLength(c.size);
      c.modules.forEach((r) => expect(r).toHaveLength(c.size));
    });

    it(`has the three finder patterns, the timing lines and the dark module (${text.length} bytes)`, () => {
      const c = q();
      const ring = (ox: number, oy: number) => {
        for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
          const edge = x === 0 || x === 6 || y === 0 || y === 6;
          const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
          expect(c.modules[oy + y][ox + x], `finder module ${x},${y}`).toBe(edge || core);
        }
      };
      ring(0, 0); ring(c.size - 7, 0); ring(0, c.size - 7);
      for (let i = 8; i < c.size - 8; i++) {
        expect(c.modules[6][i], `timing row ${i}`).toBe(i % 2 === 0);
        expect(c.modules[i][6], `timing column ${i}`).toBe(i % 2 === 0);
      }
      expect(c.modules[c.size - 8][8]).toBe(true);
    });

    it(`has format bits that are a valid BCH codeword for level M, written twice alike (${text.length} bytes)`, () => {
      const c = q();
      const m = c.modules, n = c.size;
      // copy 1 (around the top-left finder) and copy 2 (split between the other two), both as bit 0 .. 14
      const a: boolean[] = [];
      for (let i = 0; i <= 5; i++) a[i] = m[i][8];
      a[6] = m[7][8]; a[7] = m[8][8]; a[8] = m[8][7];
      for (let i = 9; i < 15; i++) a[i] = m[8][14 - i];
      const b: boolean[] = [];
      for (let i = 0; i < 8; i++) b[i] = m[8][n - 1 - i];
      for (let i = 8; i < 15; i++) b[i] = m[n - 15 + i][8];
      expect(a).toEqual(b);
      const word = a.reduce((acc, d, i) => acc | ((d ? 1 : 0) << i), 0) ^ 0x5412;
      let rem = word;
      for (let i = 14; i >= 10; i--) if ((rem >>> i) & 1) rem ^= 0x537 << (i - 10);
      expect(rem, "BCH remainder").toBe(0);
      expect(word >>> 13, "error correction level bits: M is 00").toBe(0);
    });
  }
});

describe("golden symbols (each was decoded back correctly by jsQR 1.4.0)", () => {
  const golden: Record<string, { version: number; sha256: string }> = {
    "https://www.citizenscentral.co.za/c/example-fellowship": { version: 4, sha256: "ccc59b1f69b977a62eb5817a1859d106800eb2165a02c2280f4d935d13c692d0" },
    "https://www.citizenscentral.co.za/c/a": { version: 3, sha256: "ab6b0d17812995524178cd9a20590d6a1230e021767f2f7205bd5cee842c1d16" },
    ["https://www.citizenscentral.co.za/c/" + "x".repeat(60)]: { version: 6, sha256: "c66e4bf6d122689d6373af9a82a341af24b64d8339a96d0a2449fc9a94ce247b" },
    "https://www.citizenscentral.co.za/c/12345678-1234-1234-1234-123456789abc": { version: 5, sha256: "8a63807b17f7398cd376ee16943ba9082ca0b9d3c260f1a33f34a52a299a6481" },
  };
  for (const [text, want] of Object.entries(golden)) {
    it(`${text.length} bytes: version ${want.version}`, () => {
      const q = Q.encode(text)!;
      expect(q.version).toBe(want.version);
      expect(hash(q)).toBe(want.sha256);
    });
  }

  it("is deterministic", () => {
    const t = "https://www.citizenscentral.co.za/c/example-fellowship";
    expect(hash(Q.encode(t)!)).toBe(hash(Q.encode(t)!));
  });
});

describe("pathData (what the sheet draws)", () => {
  it("covers every dark module exactly once, inside a 4-module quiet zone", () => {
    const q = Q.encode("https://www.citizenscentral.co.za/c/example-fellowship")!;
    const { size, d } = Q.pathData(q);
    expect(size).toBe(q.size + 8);
    // replay the path into a grid
    const grid = Array.from({ length: size }, () => new Array(size).fill(0));
    for (const m of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
      const [x, y, w] = [Number(m[1]), Number(m[2]), Number(m[3])];
      for (let i = 0; i < w; i++) grid[y][x + i]++;
    }
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const inside = x >= 4 && y >= 4 && x < q.size + 4 && y < q.size + 4;
      expect(grid[y][x]).toBe(inside && q.modules[y - 4][x - 4] ? 1 : 0);
    }
  });

  it("the path is only digits and path letters (nothing from the input text reaches the markup)", () => {
    const q = Q.encode('"><script>alert(1)</script>')!;
    expect(Q.pathData(q).d).toMatch(/^[MhvzM0-9 \-]+$/);
  });
});
