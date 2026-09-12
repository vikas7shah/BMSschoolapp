import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  readSpreadsheet, parseCsv, decodeEntities, formatNumeric, SpreadsheetError,
} from '../lib/spreadsheet.ts';

const FX = new URL('./fixtures/', import.meta.url).pathname;
const load = (name: string, type = '') =>
  new File([readFileSync(`${FX}/${name}`)], name, { type });

test('reads a real Excel workbook', async () => {
  const sheet = await readSpreadsheet(load('roster.xlsx'));
  assert.deepEqual(sheet.rows[0], [
    'First Name', 'Last Name', 'Mobile', 'Email',
    'Child First Name', 'Child Last Name', 'Classroom',
  ]);
  assert.equal(sheet.rows[1]?.[0], 'Ana');
  assert.equal(sheet.rows[1]?.[1], 'García', 'accented characters survive');
});

test('keeps digits when a phone was typed as a number', async () => {
  const { rows } = await readSpreadsheet(load('roster.xlsx'));
  const ben = rows.find((r) => r[0] === 'Ben');
  assert.equal(ben?.[2], '6175550102', 'no scientific notation, no lost leading digits');
});

test('handles apostrophes and ampersands (XML entities)', async () => {
  const { rows } = await readSpreadsheet(load('roster.xlsx'));
  assert.ok(rows.some((r) => r[1] === "O'Neill"), "apostrophe preserved");
  assert.ok(rows.some((r) => r[1] === 'Ampersand & Co'), 'ampersand decoded');
  assert.ok(rows.some((r) => r[4] === 'Élodie'), 'non-ASCII preserved');
});

test('empty cells keep their column position', async () => {
  const { rows } = await readSpreadsheet(load('roster.xlsx'));
  const ben = rows.find((r) => r[0] === 'Ben');
  assert.equal(ben?.[3], '', 'missing email leaves an empty slot, not a shift');
  assert.equal(ben?.[4], 'Bo', 'later columns stay aligned');
});

test('a blank row in the middle is preserved, trailing blanks are dropped', async () => {
  const { rows } = await readSpreadsheet(load('roster.xlsx'));
  assert.ok(rows.some((r) => r.every((c) => c === '')), 'interior blank row kept');
  assert.ok(rows[rows.length - 1]!.some((c) => c !== ''), 'no trailing blank rows');
});

test('reads CSV with quotes, commas and embedded newlines', async () => {
  const { rows } = await readSpreadsheet(load('roster.csv', 'text/csv'));
  assert.equal(rows[1]?.[0], 'Ana');
  assert.equal(rows[3]?.[0], 'Smith, Jr.', 'comma inside quotes');
  assert.equal(rows[3]?.[4], 'Multi\nline', 'newline inside quotes');
});

test('CSV edge cases', () => {
  assert.deepEqual(parseCsv('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('"he said ""hi""",x'), [['he said "hi"', 'x']]);
  assert.deepEqual(parseCsv('a,,c'), [['a', '', 'c']]);
  assert.deepEqual(parseCsv('﻿a,b'), [['a', 'b']], 'BOM stripped');
  assert.deepEqual(parseCsv('a,b\r\nc,d'), [['a', 'b'], ['c', 'd']], 'CRLF');
});

test('entity decoding', () => {
  assert.equal(decodeEntities('a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;'), `a & b <c> "d" 'e'`);
  assert.equal(decodeEntities('&#233;&#x41;'), 'éA');
  assert.equal(decodeEntities('plain'), 'plain');
});

test('unsupported formats explain what to do instead', async () => {
  await assert.rejects(
    () => readSpreadsheet(new File([new Uint8Array()], 'roster.xls')),
    (e: Error) => e instanceof SpreadsheetError && /Save As/.test(e.message),
  );
  await assert.rejects(
    () => readSpreadsheet(new File([new Uint8Array()], 'roster.numbers')),
    (e: Error) => e instanceof SpreadsheetError && /Export To/.test(e.message),
  );
  await assert.rejects(
    () => readSpreadsheet(new File([new Uint8Array()], 'notes.pdf')),
    (e: Error) => e instanceof SpreadsheetError,
  );
});

test('a corrupt xlsx fails with a readable message, not a crash', async () => {
  const junk = new File([new TextEncoder().encode('this is not a zip')], 'bad.xlsx');
  await assert.rejects(
    () => readSpreadsheet(junk),
    (e: Error) => e instanceof SpreadsheetError,
  );
});

test('phones Excel stored as numbers keep their digits', () => {
  // Real rosters hit this constantly: a phone typed without formatting is
  // stored as a number and written to the file in scientific notation.
  assert.equal(formatNumeric('9.782230218E9'), '9782230218');
  assert.equal(formatNumeric('6.174353275E9'), '6174353275');
  assert.equal(formatNumeric('2.014172232E9'), '2014172232');
  assert.equal(formatNumeric('1.234567890123E12'), '1234567890123');
});

test('numeric formatting leaves everything else alone', () => {
  assert.equal(formatNumeric('6175550102'), '6175550102', 'plain digits untouched');
  assert.equal(formatNumeric('617-555-0102'), '617-555-0102', 'formatted text untouched');
  assert.equal(formatNumeric(''), '');
  assert.equal(formatNumeric('Primary'), 'Primary');
  assert.equal(formatNumeric('1.5'), '1.5', 'no exponent, no rewrite');
  assert.equal(formatNumeric('1.5E-7'), '0.00000015', 'small decimals do not collapse to 0');
  // Past 2^53 the digits cannot be trusted, so the original is kept.
  assert.equal(formatNumeric('1.2345678901234567E20'), '1.2345678901234567E20');
});
