// @vitest-environment happy-dom
import { beforeEach, expect, test, vi } from 'vitest';
import { inspectGrid, gridPoint, parseGridDate, parseGridDateKey } from '../src/grid';
import { addDays } from '../src/time';
function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) };
}
function fixture(days: number, top = 100) {
  document.body.innerHTML = '<main><div role="grid" data-timezone="America/Chicago"></div></main>';
  const grid = document.querySelector<HTMLElement>('[role=grid]')!;
  grid.getBoundingClientRect = () => rect(100, 100, 700, 500);
  for (let i = 0; i < days; i++) {
    const column = document.createElement('div'); column.dataset.date = addDays('2030-01-06', i); grid.append(column);
    column.getBoundingClientRect = () => rect(100 + i * 100, 100, 100, 1440);
  }
  for (const [minute, label] of [[0, '12 AM'], [60, '1 AM'], [120, '2 AM'], [180, '3 AM']] as const) {
    const hour = document.createElement('span'); hour.textContent = label; grid.parentElement!.append(hour);
    hour.getBoundingClientRect = () => rect(40, top + minute - 6, 40, 12);
  }
  return grid;
}
beforeEach(() => { document.body.replaceChildren(); vi.stubGlobal('innerHeight', 900); });
test('packed Google Calendar date keys decode to wall dates, including before 1970', () => {
  expect(parseGridDateKey(String((2030 - 1970) * 512 + 1 * 32 + 6))).toBe('2030-01-06');
  expect(parseGridDateKey('-97')).toBe('1969-12-31');
  expect(parseGridDateKey('not-a-date')).toBeNull();
  expect(parseGridDate('20300230')).toBeNull();
});
test('maps week columns and snaps pointer coordinates to five minutes', () => {
  fixture(7); const grid = inspectGrid()!;
  expect(grid.view.dates).toHaveLength(7); expect(grid.view.timeZone).toBe('America/Chicago');
  expect(gridPoint(grid, 250, 163)).toEqual({ date: '2030-01-07', minute: 65 });
  expect(gridPoint(grid, 99, 163)).toBeNull();
});
test('maps native packed date attributes in day view', () => {
  const grid = fixture(1); const day = grid.firstElementChild as HTMLElement;
  day.removeAttribute('data-date'); day.dataset.datekey = String(60 * 512 + 32 + 6);
  expect(inspectGrid()!.view.dates).toEqual(['2030-01-06']);
});
test('scrolling changes time geometry; resizing changes column geometry', () => {
  const grid = fixture(7, -200); const geometry = inspectGrid()!;
  expect(gridPoint(geometry, 250, 103)!.minute).toBe(305);
  const first = grid.firstElementChild as HTMLElement; first.getBoundingClientRect = () => rect(100, 100, 80, 1440);
  expect(inspectGrid()!.columns[0].right).toBe(180);
});
test('rejects month views, overlapping columns, and inconsistent time labels', () => {
  const month = fixture(42);
  [...month.children].forEach((day, i) => { (day as HTMLElement).getBoundingClientRect = () => rect(100 + i % 7 * 100, 100 + Math.floor(i / 7) * 70, 100, 70); });
  expect(inspectGrid()).toBeNull();
  const grid = fixture(7); (grid.lastElementChild as HTMLElement).getBoundingClientRect = () => rect(110, 100, 100, 1440);
  expect(inspectGrid()).toBeNull();
  fixture(1); const label = document.querySelectorAll('span')[2] as HTMLElement;
  label.getBoundingClientRect = () => rect(40, 400, 40, 12); expect(inspectGrid()).toBeNull();
});
