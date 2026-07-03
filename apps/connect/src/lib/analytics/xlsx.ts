/**
 * Minimal, dependency-free OOXML (.xlsx) writer for tabular exports.
 *
 * Why hand-rolled instead of SheetJS/exceljs:
 *   - We only ever WRITE spreadsheets, never parse them, so the known
 *     SheetJS parse-path CVEs (prototype pollution CVE-2023-30533, ReDoS
 *     CVE-2024-22363) don't apply — and the fixed SheetJS builds aren't on
 *     npm anyway. exceljs would pull a large dependency tree for a job this
 *     small. The rest of the analytics export stack (csv.ts) is likewise
 *     zero-dep by design.
 *   - The output is a real, valid workbook (Content_Types + rels + workbook
 *     + one worksheet) that Excel, Numbers and Google Sheets open natively.
 *
 * Implementation notes:
 *   - Strings are written as inline strings (`t="inlineStr"`). Inline strings
 *     are pure data and are NEVER evaluated as formulas by spreadsheet apps,
 *     so the CSV formula-injection neutraliser is deliberately NOT applied
 *     here (prefixing with `'` would corrupt the value). We only XML-escape.
 *   - Numbers are written as numeric cells (`<v>`), so they stay right-aligned
 *     and sortable.
 *   - The archive uses STORED (uncompressed) ZIP entries. That keeps the code
 *     tiny (no DEFLATE), keeps the XML human-inspectable in the output buffer
 *     (handy for tests), and the files are small enough that size is a non-issue.
 */

export type XlsxCell = string | number | null | undefined;

// ── CRC-32 (IEEE 802.3), table-based ─────────────────────────────
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xed_b8_83_20 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xff_ff_ff_ff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xff_ff_ff_ff) >>> 0;
}

// ── XML + reference helpers ──────────────────────────────────────
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Strip XML-1.0-illegal control chars (keep \t \n \r).
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

/** 0-based column index → spreadsheet column letters (0→A, 25→Z, 26→AA). */
export function columnLetter(index: number): string {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/** Excel sheet names: ≤31 chars, none of : \ / ? * [ ], non-empty. */
function sanitiseSheetName(name: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31);
  return cleaned.length > 0 ? cleaned : "Sheet1";
}

const ENCODER = new TextEncoder();

// ── ZIP (stored / uncompressed) ──────────────────────────────────
interface ZipEntry {
  name: string;
  data: Uint8Array;
  crc: number;
}

function pushU16(arr: number[], v: number): void {
  arr.push(v & 0xff, (v >>> 8) & 0xff);
}
function pushU32(arr: number[], v: number): void {
  arr.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
}
function pushBytes(arr: number[], bytes: Uint8Array): void {
  for (let i = 0; i < bytes.length; i++) arr.push(bytes[i]!);
}

// Fixed DOS timestamp (1980-01-01 00:00) → deterministic output.
const DOS_TIME = 0;
const DOS_DATE = 0x00_21;

function zipStored(files: { name: string; content: string }[]): Uint8Array {
  const entries: ZipEntry[] = files.map((f) => {
    const data = ENCODER.encode(f.content);
    return { name: f.name, data, crc: crc32(data) };
  });

  const local: number[] = [];
  const central: number[] = [];
  const offsets: number[] = [];

  for (const e of entries) {
    const nameBytes = ENCODER.encode(e.name);
    offsets.push(local.length);

    // Local file header.
    pushU32(local, 0x04_03_4b_50);
    pushU16(local, 20); // version needed
    pushU16(local, 0); // flags
    pushU16(local, 0); // compression: stored
    pushU16(local, DOS_TIME);
    pushU16(local, DOS_DATE);
    pushU32(local, e.crc);
    pushU32(local, e.data.length); // compressed size
    pushU32(local, e.data.length); // uncompressed size
    pushU16(local, nameBytes.length);
    pushU16(local, 0); // extra length
    pushBytes(local, nameBytes);
    pushBytes(local, e.data);
  }

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    const nameBytes = ENCODER.encode(e.name);

    // Central directory header.
    pushU32(central, 0x02_01_4b_50);
    pushU16(central, 20); // version made by
    pushU16(central, 20); // version needed
    pushU16(central, 0); // flags
    pushU16(central, 0); // compression
    pushU16(central, DOS_TIME);
    pushU16(central, DOS_DATE);
    pushU32(central, e.crc);
    pushU32(central, e.data.length);
    pushU32(central, e.data.length);
    pushU16(central, nameBytes.length);
    pushU16(central, 0); // extra
    pushU16(central, 0); // comment
    pushU16(central, 0); // disk number start
    pushU16(central, 0); // internal attrs
    pushU32(central, 0); // external attrs
    pushU32(central, offsets[i]!); // local header offset
    pushBytes(central, nameBytes);
  }

  const centralOffset = local.length;
  const eocd: number[] = [];
  pushU32(eocd, 0x06_05_4b_50);
  pushU16(eocd, 0); // disk number
  pushU16(eocd, 0); // disk with central dir
  pushU16(eocd, entries.length); // entries on this disk
  pushU16(eocd, entries.length); // total entries
  pushU32(eocd, central.length); // central dir size
  pushU32(eocd, centralOffset); // central dir offset
  pushU16(eocd, 0); // comment length

  return Uint8Array.from([...local, ...central, ...eocd]);
}

// ── OOXML part builders ──────────────────────────────────────────
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function cellXml(ref: string, value: XlsxCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${ref}"><v>${value}</v></c>`;
  }
  const text = escapeXml(String(value));
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
}

function rowXml(rowIndex: number, cells: XlsxCell[]): string {
  const r = rowIndex + 1; // 1-based
  const body = cells
    .map((v, c) => cellXml(`${columnLetter(c)}${r}`, v))
    .join("");
  return `<row r="${r}">${body}</row>`;
}

function sheetXml(header: string[], rows: XlsxCell[][]): string {
  const allRows = [header, ...rows];
  const rowsXml = allRows.map((cells, i) => rowXml(i, cells)).join("");
  return (
    `${XML_DECL}` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${rowsXml}</sheetData></worksheet>`
  );
}

/**
 * Build a real .xlsx workbook with a single sheet.
 *
 * @param sheetName  Tab name (sanitised to Excel's rules).
 * @param header     Column headers (row 1, all text).
 * @param rows       Data rows. Numbers become numeric cells; everything
 *                   else becomes an inline string. null/undefined → blank cell.
 * @returns          The .xlsx file as a Uint8Array.
 */
export function buildXlsx(
  sheetName: string,
  header: string[],
  rows: XlsxCell[][],
): Uint8Array {
  const safeSheet = escapeXml(sanitiseSheetName(sheetName));

  const contentTypes =
    `${XML_DECL}` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `</Types>`;

  const rootRels =
    `${XML_DECL}` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbook =
    `${XML_DECL}` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${safeSheet}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  const workbookRels =
    `${XML_DECL}` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `</Relationships>`;

  return zipStored([
    { name: "[Content_Types].xml", content: contentTypes },
    { name: "_rels/.rels", content: rootRels },
    { name: "xl/workbook.xml", content: workbook },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRels },
    { name: "xl/worksheets/sheet1.xml", content: sheetXml(header, rows) },
  ]);
}
