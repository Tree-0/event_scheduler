import { Temporal } from '@js-temporal/polyfill';
import { MINUTE, type TimeWindow } from './types';

export function instant(value: string): number {
  if (!/(Z|[+-]\d\d:\d\d)$/.test(value)) throw new Error('Time must include a UTC offset.');
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error('Invalid date/time.');
  return ms;
}
export const iso = (ms: number) => new Date(ms).toISOString();
export function dateStart(date: string, zone: string): string {
  // All-day dates begin at the zone's first valid instant, even when DST skips midnight.
  return Temporal.PlainDate.from(date).toZonedDateTime(zone).toInstant().toString();
}
export function localInstant(date: string, minutes: number, zone: string): string {
  const day = Temporal.PlainDate.from(date).add({ days: Math.floor(minutes / 1440) });
  const time = Temporal.PlainTime.from({ hour: Math.floor((minutes % 1440) / 60), minute: minutes % 60 });
  // Reject missing/repeated wall times rather than silently moving a drawn window at DST.
  return day.toPlainDateTime(time).toZonedDateTime(zone, { disambiguation: 'reject' }).toInstant().toString();
}
export function dateInZone(value: string, zone: string): string {
  return Temporal.Instant.from(value).toZonedDateTimeISO(zone).toPlainDate().toString();
}
export function localMinutes(value: string, zone: string): number {
  const t = Temporal.Instant.from(value).toZonedDateTimeISO(zone);
  return t.hour * 60 + t.minute;
}
export function addDays(date: string, days: number): string { return Temporal.PlainDate.from(date).add({ days }).toString(); }
export function weekStart(date: string): string { const d = Temporal.PlainDate.from(date); return d.subtract({ days: d.dayOfWeek % 7 }).toString(); }
export function validZone(zone: string): boolean { try { new Intl.DateTimeFormat('en', { timeZone: zone }); return true; } catch { return false; } }
export function formatTime(value: string, zone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: zone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}
export function localInput(value: string, zone: string): string {
  return Temporal.Instant.from(value).toZonedDateTimeISO(zone).toPlainDateTime().toString({ smallestUnit: 'minute' });
}
export function inputInstant(value: string, zone: string): string {
  return Temporal.PlainDateTime.from(value).toZonedDateTime(zone, { disambiguation: 'reject' }).toInstant().toString();
}
export function rangeOf(windows: TimeWindow[]): TimeWindow {
  if (!windows.length) throw new Error('Draw an availability window first.');
  return { start: iso(Math.min(...windows.map(w => instant(w.start)))), end: iso(Math.max(...windows.map(w => instant(w.end)))) };
}
export function duration(window: TimeWindow): number { return (instant(window.end) - instant(window.start)) / MINUTE; }
