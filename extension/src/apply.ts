import { CalendarError, eventBody, writable, type CalendarApi } from './calendar';
import { validatePlacements } from './constraints';
import { rangeOf, instant } from './time';
import type { AccountState, ApplyRecord, SolverRequest, SolverResult } from './types';

export interface ApplyOutcome { applied: number; errors: string[] }
export async function calendarEventId(draftId: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(draftId));
  return [...new Uint8Array(bytes)].slice(0, 16).map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function matches(raw: Record<string, any>, record: ApplyRecord): boolean {
  const body = record.body as Record<string, any>;
  return raw.status !== 'cancelled' && raw.extendedProperties?.private?.windowSchedulerDraftId === body.extendedProperties.private.windowSchedulerDraftId
    && raw.summary === body.summary && (raw.description ?? '') === body.description && (raw.location ?? '') === body.location
    && instant(raw.start?.dateTime) === instant(record.placement.start) && instant(raw.end?.dateTime) === instant(record.placement.end)
    && (raw.transparency ?? 'opaque') === body.transparency
    && raw.extendedProperties?.private?.windowSchedulerResources === body.extendedProperties.private.windowSchedulerResources;
}
export async function applySchedule(api: CalendarApi, state: AccountState, request: SolverRequest, result: SolverResult, persist: () => Promise<void>, now = new Date().toISOString()): Promise<ApplyOutcome> {
  const outcome: ApplyOutcome = { applied: 0, errors: [] };
  // Recover uncertain writes before validating the remaining proposal against the refreshed calendar.
  for (const draft of state.drafts.filter(d => d.state === 'pending' && d.applyRecord)) {
    const record = draft.applyRecord!;
    const raw = await api.get(record.calendarId, record.eventId);
    if (raw) {
      if (!matches(raw, record)) throw new Error(`${draft.title}: the previous insertion was modified. Inspect it in Calendar before retrying.`);
      record.confirmed = true; draft.state = 'applied'; outcome.applied++; await persist();
    }
  }
  const ids = request.events.map(e => e.id).filter(id => state.drafts.some(d => d.id === id && d.state === 'pending'));
  if (!ids.length) return outcome;
  const calendars = await api.calendars();
  const events = state.drafts.filter(d => ids.includes(d.id));
  for (const draft of events) if (!calendars.some(c => c.id === draft.calendarId && writable(c))) throw new Error(`${draft.title}: destination is no longer writable.`);
  const remaining: SolverResult = { ...result, placements: result.placements.filter(p => ids.includes(p.draftId)) };
  const busy = await api.events(calendars, state.policies, state.resources.map(r => r.id), rangeOf(remaining.placements));
  const fresh: SolverRequest = { ...request, events, busy, exceptions: state.exceptions, now };
  validatePlacements(fresh, remaining);
  for (const draft of events) {
    const placement = remaining.placements.find(p => p.draftId === draft.id)!;
    const eventId = draft.applyRecord?.eventId ?? await calendarEventId(draft.id);
    draft.applyRecord = { calendarId: draft.calendarId, eventId, placement, body: eventBody(draft, placement, eventId) };
    await persist(); // Persist the ID before the request; lost responses are recoverable.
    try {
      let raw: Record<string, any>;
      try { raw = await api.insert(draft.calendarId, draft.applyRecord.body); }
      catch (error) {
        if (!(error instanceof CalendarError) || error.status !== 409) throw error;
        const existing = await api.get(draft.calendarId, eventId);
        if (!existing) throw error;
        raw = existing;
      }
      if (!matches(raw, draft.applyRecord)) throw new Error('Inserted event does not match the proposal. Inspect Calendar before retrying.');
      draft.applyRecord.confirmed = true; draft.state = 'applied'; outcome.applied++; await persist();
    } catch (error) {
      outcome.errors.push(`${draft.title}: ${error instanceof Error ? error.message : String(error)}`);
      // Stop after an uncertain write. A retry reconciles it before creating anything else.
      break;
    }
  }
  return outcome;
}
