/** Wall-clock time in an IANA zone to a UTC instant (DST-safe: re-checks the offset at the result). */
export function zonedTime(day: string, hhmm: string, tz: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const wall = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), h, m);
  const offsetAt = (t: number) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
  };
  let t = wall - offsetAt(wall);
  t = wall - offsetAt(t);
  return new Date(t);
}
