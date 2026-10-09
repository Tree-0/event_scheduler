import { instant, iso } from './time';
import { MINUTE, type DraftEvent, type SolverRequest, type SolverResult, type TimeWindow } from './types';

export const shares = (a: string[], b: string[]) => a.some(id => b.includes(id));
export function subtract(windows: TimeWindow[], cut: TimeWindow): TimeWindow[] {
  const a = instant(cut.start), b = instant(cut.end);
  return windows.flatMap(w => {
    const s = instant(w.start), e = instant(w.end);
    if (a >= e || b <= s) return [w];
    const parts: TimeWindow[] = [];
    if (s < a) parts.push({ start: iso(s), end: iso(Math.min(a, e)) });
    if (b < e) parts.push({ start: iso(Math.max(b, s)), end: iso(e) });
    return parts;
  });
}
export function usableWindows(event: DraftEvent, request: SolverRequest): TimeWindow[] {
  let windows = event.windows.map(w => ({ start: iso(Math.max(instant(w.start), instant(request.now))), end: w.end })).filter(w => instant(w.end) > instant(w.start));
  for (const busy of request.busy) {
    if (!shares(event.resourceIds, busy.resourceIds)) continue;
    let blocks: TimeWindow[] = [busy];
    for (const exception of request.exceptions) {
      if (exception.eventKey === busy.key && exception.draftIds.includes(event.id)
          && instant(exception.eventStart) === instant(busy.start) && instant(exception.eventEnd) === instant(busy.end)) blocks = subtract(blocks, exception);
    }
    for (const block of blocks) windows = subtract(windows, block);
  }
  return windows;
}
export function validateRequest(request: SolverRequest): void {
  if (request.model !== 'makespan') throw new Error('Unknown objective.');
  if (!request.events.length) throw new Error('Select at least one pending draft.');
  instant(request.now);
  const ids = new Set<string>();
  for (const event of request.events) {
    if (!event.id || ids.has(event.id)) throw new Error('Draft IDs must be unique.');
    ids.add(event.id);
    if (!event.title.trim()) throw new Error('Every draft needs a title.');
    if (!event.calendarId) throw new Error(`${event.title}: choose a destination calendar.`);
    if (!Number.isSafeInteger(event.durationMinutes) || event.durationMinutes <= 0) throw new Error(`${event.title}: duration must be a positive whole number of minutes.`);
    if (!event.windows.length) throw new Error(`${event.title}: draw at least one window.`);
    for (const w of event.windows) if (instant(w.end) <= instant(w.start)) throw new Error(`${event.title}: invalid availability window.`);
  }
  for (const b of request.busy) if (instant(b.end) <= instant(b.start)) throw new Error('Invalid existing event interval.');
  for (const e of request.exceptions) if (instant(e.end) <= instant(e.start)) throw new Error('Invalid conflict exception.');
}
export function validatePlacements(request: SolverRequest, result: SolverResult): void {
  validateRequest(request);
  if (!['optimal', 'feasible'].includes(result.status)) throw new Error('No schedule to apply.');
  if (result.placements.length !== request.events.length) throw new Error('The proposal does not include every selected draft.');
  const seen = new Set<string>();
  for (const p of result.placements) {
    const event = request.events.find(e => e.id === p.draftId);
    if (!event || seen.has(p.draftId)) throw new Error('Invalid proposal draft ID.');
    seen.add(p.draftId);
    const s = instant(p.start), e = instant(p.end);
    if (s % (5 * MINUTE) !== 0 || e - s !== event.durationMinutes * MINUTE) throw new Error('Invalid proposal duration or start grid.');
    if (!usableWindows(event, request).some(w => instant(w.start) <= s && e <= instant(w.end))) throw new Error(`${event.title}: the proposed time is no longer available. Schedule again.`);
  }
  for (let i = 0; i < result.placements.length; i++) for (let j = i + 1; j < result.placements.length; j++) {
    const a = result.placements[i], b = result.placements[j];
    const ea = request.events.find(e => e.id === a.draftId)!, eb = request.events.find(e => e.id === b.draftId)!;
    if (shares(ea.resourceIds, eb.resourceIds) && instant(a.start) < instant(b.end) && instant(b.start) < instant(a.end)) throw new Error('Proposal has a shared-resource overlap.');
  }
}
