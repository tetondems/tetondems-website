const TZ = 'America/Denver';

const day = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' });
const dayYear = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const time = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const long = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

const sameDay = (a: Date, b: Date) => day.format(a) === day.format(b);
const thisYear = (d: Date) => d.getFullYear() === new Date().getFullYear();

/** "Fri, Oct 16 · 11:45 AM–1:00 PM" or "Sat, Jul 4, 2026 · 10:00 AM" */
export function formatEventDate(start: Date, end?: Date): string {
  const d = thisYear(start) ? day.format(start) : dayYear.format(start);
  const t = time.format(start).replace(':00', '');
  if (end && !sameDay(start, end)) return `${d} – ${(thisYear(end) ? day : dayYear).format(end)}`;
  if (end && end.getTime() !== start.getTime()) return `${d} · ${t}–${time.format(end).replace(':00', '')}`;
  return `${d} · ${t}`;
}

export function formatLongDate(d: Date): string {
  return long.format(d);
}

export function formatTimeRange(start: Date, end?: Date): string {
  const t = time.format(start).replace(':00', '');
  return end && end.getTime() !== start.getTime() ? `${t} – ${time.format(end).replace(':00', '')}` : t;
}

export function formatPostDate(d: Date): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'long', day: 'numeric', year: 'numeric' }).format(d);
}
