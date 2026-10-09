import { initialState } from '../src/store';
import type { DraftEvent, ExistingEvent, SolverRequest, SolverResult } from '../src/types';
export const at = (minute: number) => new Date(Date.parse('2030-01-01T10:00:00Z') + minute * 60_000).toISOString();
export function event(id: string, duration = 30, resources = ['attention'], start = 0, end = 120): DraftEvent {
  return { id, title: id, durationMinutes: duration, resourceIds: resources, windows: [{ start: at(start), end: at(end) }], description: '', location: '', calendarId: 'primary', selected: true, state: 'pending' };
}
export function busy(id: string, start: number, end: number, resources = ['attention']): ExistingEvent {
  return { key: `primary/${id}`, id, calendarId: 'primary', title: id, start: at(start), end: at(end), allDay: false, resourceIds: resources };
}
export function request(events: DraftEvent[], commitments: ExistingEvent[] = []): SolverRequest { return { events, busy: commitments, exceptions: [], now: at(-60), model: 'makespan' }; }
export function proposal(events: DraftEvent[], starts: number[]): SolverResult { return { status: 'optimal', diagnostics: [], placements: events.map((e, i) => ({ draftId: e.id, start: at(starts[i]), end: at(starts[i] + e.durationMinutes) })) }; }
export function account(events: DraftEvent[]) {
  return { ...initialState(), drafts: events, policies: [{ calendarId: 'primary', enabled: true, visible: true, mode: 'block' as const, resourceIds: ['attention'] }] };
}
