import type { CalendarView } from './types';
import { addDays } from './time';
export interface DayColumn { date: string; left: number; right: number }
export interface GridGeometry { view: CalendarView; columns: DayColumn[]; minuteY: number; pixelsPerMinute: number; top: number; bottom: number }
export function parseGridDate(raw: string): string | null {
  let date: string;
  if (/^\d{8}$/.test(raw)) date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) date = raw;
  else return null;
  try { if (addDays(date, 0) === date) return date; } catch { /* invalid */ }
  return null;
}
// Google Calendar uses a packed wall-date key on its day columns and headers.
export function parseGridDateKey(raw: string): string | null {
  if (!/^-?\d+$/.test(raw)) return null;
  const key = Number(raw); if (!Number.isSafeInteger(key) || Math.abs(key) > 1_000_000) return null;
  const year = 1970 + Math.floor(key / 512), month = (key >> 5) & 15, day = key & 31;
  return parseGridDate(`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
}
function hourLabel(text: string): number | null {
  const cleaned = text.trim().replace(/[\u202f\u00a0]/g, ' ');
  const twelve = /^(\d{1,2})(?::00)?\s*(AM|PM)$/i.exec(cleaned);
  if (twelve && Number(twelve[1]) >= 1 && Number(twelve[1]) <= 12) return Number(twelve[1]) % 12 * 60 + (twelve[2].toUpperCase() === 'PM' ? 720 : 0);
  const twentyFour = /^(\d{1,2}):00$/.exec(cleaned);
  if (twentyFour && Number(twentyFour[1]) < 24) return Number(twentyFour[1]) * 60;
  return null;
}
export function inspectGrid(doc: Document = document): GridGeometry | null {
  const grids = [...doc.querySelectorAll<HTMLElement>('[role="grid"]')].filter(g => g.getBoundingClientRect().width > 200);
  for (const grid of grids) {
    const rect = grid.getBoundingClientRect();
    const dates = new Map<string, HTMLElement[]>();
    for (const element of grid.querySelectorAll<HTMLElement>('[data-date], [data-datekey]')) {
      const date = element.dataset.datekey ? parseGridDateKey(element.dataset.datekey) : parseGridDate(element.dataset.date ?? '');
      const r = element.getBoundingClientRect();
      if (date && r.width > 20 && r.right > rect.left && r.left < rect.right) dates.set(date, [...(dates.get(date) ?? []), element]);
    }
    if (![1, 7].includes(dates.size)) continue;
    const columns: DayColumn[] = [];
    for (const [date, elements] of dates) {
      const element = elements.sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
      const r = element.getBoundingClientRect(); columns.push({ date, left: r.left, right: r.right });
    }
    columns.sort((a, b) => a.left - b.left);
    if (columns.some((c, i) => i > 0 && (c.left < columns[i - 1].right - 3 || c.date !== addDays(columns[i - 1].date, 1)))) continue;
    const labels: { minute: number; y: number }[] = [];
    const scope = grid.parentElement ?? grid;
    for (const element of scope.querySelectorAll<HTMLElement>('span, [role="rowheader"], [data-hour]')) {
      if (element.childElementCount > 0) continue;
      const minute = hourLabel(element.textContent ?? '');
      const r = element.getBoundingClientRect();
      if (minute !== null && r.width && r.right <= columns[0].left + 10) labels.push({ minute, y: r.top + r.height / 2 });
    }
    const sorted = labels.sort((a, b) => a.minute - b.minute).filter((l, i, a) => !i || l.minute !== a[i - 1].minute);
    if (sorted.length < 3) continue;
    const slopes = sorted.slice(1).map((l, i) => (l.y - sorted[i].y) / (l.minute - sorted[i].minute));
    const scale = [...slopes].sort((a, b) => a - b)[Math.floor(slopes.length / 2)];
    if (scale < 0.25 || scale > 4 || slopes.some(s => Math.abs(s - scale) > scale * 0.12)) continue;
    const zero = sorted[0].y - sorted[0].minute * scale;
    const fullColumns = [...dates.values()].flat().filter(e => e.getBoundingClientRect().height > 300);
    let clip: HTMLElement = grid;
    for (let parent = fullColumns[0]?.parentElement; parent; parent = parent.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) { clip = parent; break; }
      if (parent === grid) break;
    }
    const cr = clip.getBoundingClientRect();
    const timeZone = scope.querySelector<HTMLElement>('[data-timezone]')?.dataset.timezone ?? grid.dataset.timezone;
    return { view: { supported: true, dates: columns.map(c => c.date), timeZone }, columns, minuteY: zero, pixelsPerMinute: scale,
      top: Math.max(cr.top, zero, 0), bottom: Math.min(cr.bottom, zero + 1440 * scale, innerHeight) };
  }
  return null;
}
export function gridPoint(geometry: GridGeometry, x: number, y: number): { date: string; minute: number } | null {
  const column = geometry.columns.find(c => x >= c.left && x < c.right);
  if (!column || y < geometry.top || y > geometry.bottom) return null;
  return { date: column.date, minute: Math.max(0, Math.min(1440, Math.round((y - geometry.minuteY) / geometry.pixelsPerMinute / 5) * 5)) };
}
