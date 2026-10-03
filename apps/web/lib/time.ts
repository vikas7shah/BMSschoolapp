/** "08:20" → "8:20 am" */
export function clock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** "8:00–8:20 am", or "11:40 am–12:00 pm" when it crosses noon. */
export function clockRange(start: string, end: string): string {
  const a = clock(start);
  const b = clock(end);
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`;
}
