/**
 * Reads .xlsx and .csv files into rows of strings, with no dependencies.
 *
 * An .xlsx is a ZIP of XML, and every runtime we care about can already unzip
 * (DecompressionStream), so the whole job is about 200 lines. That is worth
 * doing here: the maintained SheetJS build is not published to npm, and the npm
 * copy carries an unpatched prototype-pollution advisory. Anything this parser
 * cannot read falls back to a clear "save it as CSV" message.
 *
 * The XML is read with a small scanner rather than DOMParser so this module has
 * no DOM dependency and can be unit-tested outside a browser.
 */

export interface Sheet {
  /** Row 0 is whatever the file's first row was — usually the header. */
  rows: string[][];
  sheetName?: string;
}

export class SpreadsheetError extends Error {}

export async function readSpreadsheet(file: File): Promise<Sheet> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.csv') || name.endsWith('.txt') || file.type === 'text/csv') {
    return { rows: parseCsv(await file.text()) };
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) {
    return readXlsx(await file.arrayBuffer());
  }
  if (name.endsWith('.xls')) {
    throw new SpreadsheetError(
      'That is the older .xls format. Open it in Excel and choose File → Save As → .xlsx or .csv.',
    );
  }
  if (name.endsWith('.numbers')) {
    throw new SpreadsheetError(
      'Numbers files cannot be read directly. In Numbers choose File → Export To → CSV.',
    );
  }
  throw new SpreadsheetError('Please choose a .xlsx or .csv file.');
}

/* ------------------------------------------------------------------- CSV */

/** RFC 4180: quoted fields, "" escapes, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;

  // A BOM would otherwise become part of the first header name.
  if (text.charCodeAt(0) === 0xfeff) i = 1;

  while (i < text.length) {
    const ch = text[i]!;

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i += 1; continue;
      }
      field += ch; i += 1; continue;
    }

    if (ch === '"') { quoted = true; i += 1; continue; }
    if (ch === ',') { row.push(field); field = ''; i += 1; continue; }
    if (ch === '\r') { i += 1; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 1; continue; }
    field += ch; i += 1;
  }

  row.push(field);
  rows.push(row);

  // Drop trailing blank lines the editor left behind.
  while (rows.length && rows[rows.length - 1]!.every((c) => c.trim() === '')) rows.pop();
  return rows;
}

/* ------------------------------------------------------------------ XLSX */

interface ZipEntry { name: string; method: number; offset: number; size: number }

async function readXlsx(buffer: ArrayBuffer): Promise<Sheet> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const entries = readZipDirectory(view, bytes);

  const sheetEntry = pickFirstWorksheet(entries);
  if (!sheetEntry) {
    throw new SpreadsheetError('That file has no readable worksheet. Try saving it as CSV.');
  }

  const sharedEntry = entries.find((e) => e.name === 'xl/sharedStrings.xml');
  const shared = sharedEntry
    ? parseSharedStrings(await inflate(bytes, view, sharedEntry))
    : [];

  return {
    rows: parseWorksheet(await inflate(bytes, view, sheetEntry), shared),
    sheetName: sheetEntry.name,
  };
}

/** Worksheets are sheet1.xml, sheet2.xml…; the first is what people mean. */
function pickFirstWorksheet(entries: ZipEntry[]): ZipEntry | undefined {
  const sheets = entries
    .filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name))
    .sort((a, b) => sheetNumber(a.name) - sheetNumber(b.name));
  return sheets[0];
}

const sheetNumber = (name: string) => Number(/sheet(\d+)\.xml$/.exec(name)?.[1] ?? 0);

function readZipDirectory(view: DataView, bytes: Uint8Array): ZipEntry[] {
  // End-of-central-directory record, scanned backwards past any comment.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 66_000; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new SpreadsheetError('That file is not a valid .xlsx workbook.');

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];

  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const offset = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    entries.push({ name, method, offset, size });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function inflate(bytes: Uint8Array, view: DataView, entry: ZipEntry): Promise<string> {
  if (view.getUint32(entry.offset, true) !== 0x04034b50) {
    throw new SpreadsheetError('That .xlsx file looks damaged. Try re-saving it.');
  }
  // The local header repeats the name/extra lengths; the data follows them.
  const nameLen = view.getUint16(entry.offset + 26, true);
  const extraLen = view.getUint16(entry.offset + 28, true);
  const start = entry.offset + 30 + nameLen + extraLen;
  const data = bytes.subarray(start, start + entry.size);

  if (entry.method === 0) return new TextDecoder().decode(data);
  if (entry.method !== 8) {
    throw new SpreadsheetError('That .xlsx uses an unsupported compression. Try saving it as CSV.');
  }
  if (typeof DecompressionStream === 'undefined') {
    throw new SpreadsheetError('This browser cannot open .xlsx files. Please save the sheet as CSV.');
  }

  const stream = new Blob([data as BlobPart]).stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

/* ------------------------------------------------- a very small XML reader */

interface Tag { name: string; attrs: Record<string, string>; selfClosing: boolean }
type XmlEvent = { kind: 'open'; tag: Tag } | { kind: 'close'; name: string } | { kind: 'text'; text: string };

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
};

export function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    }
    if (body.startsWith('#')) return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    return ENTITIES[body] ?? whole;
  });
}

/** Enough of XML for machine-generated SpreadsheetML: tags, attributes, text. */
function* scanXml(xml: string): Generator<XmlEvent> {
  let i = 0;
  while (i < xml.length) {
    const lt = xml.indexOf('<', i);
    if (lt === -1) break;

    if (lt > i) {
      const text = xml.slice(i, lt);
      if (text) yield { kind: 'text', text: decodeEntities(text) };
    }

    // Skip declarations, comments and processing instructions wholesale.
    if (xml.startsWith('<!--', lt)) { i = xml.indexOf('-->', lt) + 3 || xml.length; continue; }
    if (xml.startsWith('<?', lt) || xml.startsWith('<!', lt)) {
      i = xml.indexOf('>', lt) + 1 || xml.length;
      continue;
    }

    const gt = findTagEnd(xml, lt);
    if (gt === -1) break;
    const raw = xml.slice(lt + 1, gt);
    i = gt + 1;

    if (raw.startsWith('/')) { yield { kind: 'close', name: localName(raw.slice(1).trim()) }; continue; }

    const selfClosing = raw.endsWith('/');
    const body = selfClosing ? raw.slice(0, -1) : raw;
    const match = /^([^\s/>]+)/.exec(body);
    if (!match) continue;

    yield {
      kind: 'open',
      tag: { name: localName(match[1]!), attrs: parseAttrs(body.slice(match[1]!.length)), selfClosing },
    };
  }
}

/** Tag end, respecting quoted attribute values that may contain ">". */
function findTagEnd(xml: string, from: number): number {
  let quote: string | null = null;
  for (let i = from + 1; i < xml.length; i++) {
    const ch = xml[i]!;
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '>') return i;
  }
  return -1;
}

/** Namespace prefixes are irrelevant to us; "x:row" and "row" are the same. */
const localName = (n: string) => (n.includes(':') ? n.slice(n.indexOf(':') + 1) : n);

function parseAttrs(s: string): Record<string, string> {
  const attrs: Record<string, string> = Object.create(null) as Record<string, string>;
  const re = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    attrs[localName(m[1]!)] = decodeEntities(m[3] ?? m[4] ?? '');
  }
  return attrs;
}

/* ------------------------------------------------------- xlsx XML parts */

export function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  let inSi = false;
  let inT = false;
  let buf = '';

  for (const ev of scanXml(xml)) {
    if (ev.kind === 'open') {
      if (ev.tag.name === 'si') { inSi = true; buf = ''; }
      // <t> inside <rPh> is phonetic guidance, not the value; xlsx puts it
      // after the runs, so only text before the first </si> matters here.
      else if (ev.tag.name === 't' && inSi && !ev.tag.selfClosing) inT = true;
    } else if (ev.kind === 'text') {
      if (inT) buf += ev.text;
    } else if (ev.kind === 'close') {
      if (ev.name === 't') inT = false;
      else if (ev.name === 'si') { out.push(buf); inSi = false; }
    }
  }
  return out;
}

export function parseWorksheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  let cells: string[] = [];
  let width = 0;

  // Excel omits entirely-empty rows from the XML, so rows are placed by their
  // own `r` index rather than appended. Without this, one blank row in the
  // middle would shift every later row up and every "row 8 is wrong" message
  // would point at the wrong line.
  let rowIndex = 0;
  let col = 0;
  let type = '';
  let inValue = false;   // <v> or <t> within the current cell
  let buf = '';
  let hasCell = false;

  for (const ev of scanXml(xml)) {
    if (ev.kind === 'open') {
      const { name, attrs, selfClosing } = ev.tag;
      if (name === 'row') {
        cells = [];
        rowIndex = attrs.r ? Math.max(1, Number(attrs.r)) - 1 : rows.length;
      }
      else if (name === 'c') {
        col = attrs.r ? columnIndex(attrs.r) : cells.length;
        type = attrs.t ?? '';
        buf = '';
        hasCell = !selfClosing;
        if (selfClosing) placeCell(cells, col, '');
      } else if ((name === 'v' || name === 't') && hasCell && !selfClosing) {
        inValue = true;
      }
    } else if (ev.kind === 'text') {
      if (inValue) buf += ev.text;
    } else if (ev.kind === 'close') {
      if (ev.name === 'v' || ev.name === 't') inValue = false;
      else if (ev.name === 'c' && hasCell) {
        placeCell(cells, col, resolveCell(type, buf, shared));
        hasCell = false;
      } else if (ev.name === 'row') {
        width = Math.max(width, cells.length);
        while (rows.length < rowIndex) rows.push([]);
        rows[rowIndex] = cells;
      }
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] ?? [];
    while (r.length < width) r.push('');
    rows[i] = r;
  }
  while (rows.length && rows[rows.length - 1]!.every((c) => c.trim() === '')) rows.pop();
  return rows;
}

/** Empty cells are omitted from the XML entirely, so place by column index. */
function placeCell(cells: string[], col: number, value: string): void {
  while (cells.length < col) cells.push('');
  cells[col] = value;
}

function resolveCell(type: string, buf: string, shared: string[]): string {
  if (type === 's') return shared[Number(buf)] ?? '';
  if (type === 'b') return buf === '1' ? 'TRUE' : 'FALSE';
  if (type === 'inlineStr' || type === 'str') return buf;
  // Untyped cells are numbers, and Excel may write them in scientific notation
  // (<v>9.782230218E9</v>). Left as-is, a phone number becomes "9.782230218E9"
  // and then normalises to a completely different number, so numeric cells are
  // rendered back to plain digits here.
  return formatNumeric(buf);
}

const NUMERIC = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/** Renders a numeric cell without exponent notation, losing no digits. */
export function formatNumeric(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || !NUMERIC.test(trimmed)) return raw;
  // Only worth rewriting when an exponent is actually present; anything else
  // is already the literal the sheet author typed.
  if (!/[eE]/.test(trimmed)) return raw;

  const n = Number(trimmed);
  if (!Number.isFinite(n)) return raw;
  // Beyond 2^53 the digits are no longer trustworthy; keep the original rather
  // than inventing precision.
  if (Math.abs(n) > Number.MAX_SAFE_INTEGER) return raw;
  if (Number.isInteger(n)) return n.toFixed(0);

  // A non-integer with an exponent: expand without going through toFixed's
  // rounding, so 1.5e-7 does not collapse to 0.
  return n.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 });
}

/** "AB12" → 27 (zero-based column). */
function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    const code = ch.charCodeAt(0);
    if (code < 65 || code > 90) break;
    n = n * 26 + (code - 64);
  }
  return Math.max(0, n - 1);
}
