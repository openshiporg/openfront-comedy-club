import { zonedTime } from './time';

export const MAX_SERIES_SHOWS = 26;
export const MAX_SERIES_SPAN_DAYS = 400;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const FALLBACK_MINUTES = 90;

export type Pattern = { dates?: string[]; from?: string; count?: number; everyDays?: number };
export type SourceShow = { startsAt: Date; doorsAt: Date | null; endsAt: Date | null };
export type Existing = { id: string; title: string; startsAt: Date; endsAt: Date | null };
export type PlanRow = { day: string; startsAt: Date; doorsAt: Date | null; endsAt: Date | null; key: string; problem: string | null };

export const localDay = (d: Date, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
export const localTime = (d: Date, tz: string) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
const realDay = (s: string) => { if (!DAY.test(s)) throw new Error('Dates must be YYYY-MM-DD'); const x = new Date(s + 'T00:00:00Z'); if (Number.isNaN(x.getTime()) || x.toISOString().slice(0, 10) !== s) throw new Error('Invalid date: ' + s); return x; };
const addDays = (s: string, n: number) => new Date(realDay(s).getTime() + n * 864e5).toISOString().slice(0, 10);

/** The calendar days a series will run on: an explicit list, or `count` days starting at `from` every `everyDays` days. Sorted, unique, bounded. */
export function expandDays(p: Pattern): string[] {
  let days: string[];
  if (p.dates?.length) days = p.dates.map(String);
  else {
    if (!p.from) throw new Error('Choose the dates or a start date');
    const count = Number(p.count), step = Number(p.everyDays ?? 7);
    if (!Number.isInteger(count) || count < 1) throw new Error('Choose how many shows');
    if (!Number.isInteger(step) || step < 1 || step > 60) throw new Error('Days between shows must be 1 to 60');
    if (count > MAX_SERIES_SHOWS) throw new Error(`A series can create at most ${MAX_SERIES_SHOWS} shows`);
    days = Array.from({ length: count }, (_, i) => addDays(p.from!, i * step));
  }
  for (const d of days) realDay(d);
  days = [...new Set(days)].sort();
  if (!days.length) throw new Error('Choose at least one date');
  if (days.length > MAX_SERIES_SHOWS) throw new Error(`A series can create at most ${MAX_SERIES_SHOWS} shows`);
  if ((realDay(days[days.length - 1]).getTime() - realDay(days[0]).getTime()) / 864e5 > MAX_SERIES_SPAN_DAYS) throw new Error('A series cannot span more than ' + MAX_SERIES_SPAN_DAYS + ' days');
  return days;
}

const endOf = (s: { startsAt: Date; endsAt: Date | null }) => s.endsAt ?? new Date(s.startsAt.getTime() + FALLBACK_MINUTES * 60000);
export const overlaps = (a: { startsAt: Date; endsAt: Date | null }, b: { startsAt: Date; endsAt: Date | null }) => a.startsAt < endOf(b) && b.startsAt < endOf(a);

/**
 * Turns a source show into dated copies in the venue timezone: same local start time (or `startTime`), same doors lead and length.
 * Each row carries a problem when it is in the past or the room is already booked then; creation refuses the whole series if any row has one.
 */
export function planSeries(source: SourceShow, tz: string, p: Pattern, existing: Existing[], now: Date, startTime?: string, keyPrefix = 'series'): PlanRow[] {
  if (startTime !== undefined && !HHMM.test(startTime)) throw new Error('Start time must be HH:MM');
  const time = startTime || localTime(source.startsAt, tz);
  const doorsLead = source.doorsAt ? source.startsAt.getTime() - source.doorsAt.getTime() : null;
  const length = source.endsAt ? source.endsAt.getTime() - source.startsAt.getTime() : null;
  if (doorsLead !== null && doorsLead < 0) throw new Error('The source show has doors after its start');
  if (length !== null && length <= 0) throw new Error('The source show ends before it starts');
  const rows: PlanRow[] = expandDays(p).map((day) => {
    const startsAt = zonedTime(day, time, tz);
    const row: PlanRow = { day, startsAt, doorsAt: doorsLead === null ? null : new Date(startsAt.getTime() - doorsLead), endsAt: length === null ? null : new Date(startsAt.getTime() + length), key: `${keyPrefix}:${day}`, problem: null };
    if (startsAt <= now) row.problem = 'In the past';
    else { const clash = existing.find((e) => overlaps(row, e)); if (clash) row.problem = `Room already booked: ${clash.title}`; }
    return row;
  });
  return rows;
}

export const planProblems = (rows: PlanRow[]) => rows.filter((r) => r.problem);

/** Which of a series' shows an edit may touch: future, not cancelled/finished. Time and capacity changes also need no sold or held seats. */
export function editable(show: { startsAt: Date | null; status: string }, now: Date) {
  return !!show.startsAt && show.startsAt > now && !['cancelled', 'completed', 'settled', 'in_progress', 'doors_open'].includes(show.status);
}
export type SeriesEdit = { title?: string; publicNote?: string; ageRestriction?: string; startTime?: string; capacity?: number };
export function normalizeEdit(e: any): SeriesEdit {
  const out: SeriesEdit = {};
  if (e.title !== undefined) { const t = String(e.title).trim(); if (!t || t.length > 120) throw new Error('Title is required (120 characters at most)'); out.title = t; }
  if (e.publicNote !== undefined) { const n = String(e.publicNote); if (n.length > 1000) throw new Error('Note is too long'); out.publicNote = n; }
  if (e.ageRestriction !== undefined) { if (!['all', '18', '21'].includes(String(e.ageRestriction))) throw new Error('Age must be all, 18 or 21'); out.ageRestriction = String(e.ageRestriction); }
  if (e.startTime !== undefined && e.startTime !== null && e.startTime !== '') { if (!HHMM.test(String(e.startTime))) throw new Error('Start time must be HH:MM'); out.startTime = String(e.startTime); }
  if (e.capacity !== undefined && e.capacity !== null) { const c = Number(e.capacity); if (!Number.isInteger(c) || c < 1 || c > 5000) throw new Error('Capacity must be 1 to 5000'); out.capacity = c; }
  if (!Object.keys(out).length) throw new Error('Nothing to change');
  return out;
}
