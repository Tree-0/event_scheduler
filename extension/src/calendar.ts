import { ATTENTION, type AccountState, type CalendarInfo, type CalendarPolicy, type DraftEvent, type ExistingEvent, type Placement, type TimeWindow } from './types';
import { instant, dateStart } from './time';

export class CalendarError extends Error { constructor(message: string, readonly status: number) { super(message); } }
export interface CalendarApi {
  calendars(): Promise<CalendarInfo[]>;
  events(calendars: CalendarInfo[], policies: CalendarPolicy[], resources: string[], range: TimeWindow): Promise<ExistingEvent[]>;
  get(calendarId: string, eventId: string): Promise<Record<string, any> | null>;
  insert(calendarId: string, body: Record<string, unknown>): Promise<Record<string, any>>;
}
export type RawEvent = Record<string, any>;
export function normalizeEvent(raw: RawEvent, calendar: CalendarInfo, policy: CalendarPolicy, knownResources: string[]): ExistingEvent | null {
  if (raw.status === 'cancelled') return null;
  if (!raw.start || !raw.end) throw new Error(`${calendar.summary}: an event is missing its time. Refresh before scheduling.`);
  const allDay = !raw.start.dateTime;
  const start = raw.start.dateTime ?? dateStart(raw.start.date, calendar.timeZone);
  const end = raw.end.dateTime ?? dateStart(raw.end.date, calendar.timeZone);
  if (!raw.id || instant(end) <= instant(start)) throw new Error(`${calendar.summary}: invalid event data.`);
  const declined = raw.attendees?.some((a: RawEvent) => a.self && a.responseStatus === 'declined');
  let resourceIds: string[] = [];
  if (policy.mode === 'block' && !declined) {
    const properties = raw.extendedProperties?.private;
    let recorded: unknown;
    if (properties?.windowSchedulerVersion === '1') {
      try { recorded = JSON.parse(properties.windowSchedulerResources); } catch { /* unknown metadata uses calendar policy */ }
    }
    if (Array.isArray(recorded) && recorded.every(id => typeof id === 'string' && knownResources.includes(id))) resourceIds = [...new Set(recorded)];
    else if (properties?.windowSchedulerVersion === '1' || raw.transparency !== 'transparent') resourceIds = [...policy.resourceIds];
  }
  return { key: `${calendar.id}/${raw.id}`, id: raw.id, calendarId: calendar.id, title: raw.summary || '(Untitled event)', start, end, allDay, resourceIds,
    htmlLink: typeof raw.htmlLink === 'string' && raw.htmlLink.startsWith('https://calendar.google.com/') ? raw.htmlLink : undefined,
    unavailableDetails: !raw.summary && calendar.accessRole === 'freeBusyReader' };
}
export function eventBody(draft: DraftEvent, placement: Placement, eventId: string): Record<string, unknown> {
  return {
    id: eventId, summary: draft.title, description: draft.description, location: draft.location,
    start: { dateTime: placement.start }, end: { dateTime: placement.end },
    transparency: draft.resourceIds.includes(ATTENTION) ? 'opaque' : 'transparent',
    extendedProperties: { private: { windowSchedulerVersion: '1', windowSchedulerDraftId: draft.id, windowSchedulerResources: JSON.stringify(draft.resourceIds) } },
  };
}
export function writable(calendar: CalendarInfo): boolean { return ['owner', 'writer'].includes(calendar.accessRole); }
export function defaultPolicy(calendar: CalendarInfo): CalendarPolicy { return { calendarId: calendar.id, enabled: Boolean(calendar.primary), visible: true, mode: 'block', resourceIds: [ATTENTION] }; }

export class GoogleCalendar implements CalendarApi {
  // Native browser fetch requires its global receiver when stored as a method.
  constructor(private token: (interactive?: boolean) => Promise<string>, private invalidate: (token: string) => Promise<void>, private fetcher: typeof fetch = globalThis.fetch.bind(globalThis)) {}
  private async request(path: string, init: RequestInit = {}, retry = true): Promise<any> {
    const token = await this.token();
    const response = await this.fetcher(`https://www.googleapis.com/calendar/v3/${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers } });
    if (response.status === 401 && retry) { await this.invalidate(token); return this.request(path, init, false); }
    if (!response.ok) {
      const message = response.status === 401 ? 'Reconnect Google Calendar.' : response.status === 403 ? 'Calendar access was denied. Check permissions or your API quota.' : response.status === 429 ? 'Calendar rate limit reached. Wait and retry.' : `Calendar request failed (${response.status}).`;
      throw new CalendarError(message, response.status);
    }
    return response.status === 204 ? {} : response.json();
  }
  async calendars(): Promise<CalendarInfo[]> {
    const all: CalendarInfo[] = []; let pageToken = '';
    do {
      const query = new URLSearchParams({ maxResults: '250', showDeleted: 'false' });
      if (pageToken) query.set('pageToken', pageToken);
      const data = await this.request(`users/me/calendarList?${query}`);
      for (const raw of data.items ?? []) all.push({ id: raw.id, summary: raw.summaryOverride ?? raw.summary, timeZone: raw.timeZone ?? 'UTC', accessRole: raw.accessRole, primary: raw.primary, color: raw.backgroundColor });
      pageToken = data.nextPageToken ?? '';
    } while (pageToken);
    return all;
  }
  async events(calendars: CalendarInfo[], policies: CalendarPolicy[], resources: string[], range: TimeWindow): Promise<ExistingEvent[]> {
    const all: ExistingEvent[] = [];
    // All enabled calendars are queried even when hidden; failure never means free time.
    for (const policy of policies.filter(p => p.enabled)) {
      const calendar = calendars.find(c => c.id === policy.calendarId);
      if (!calendar) throw new Error('An enabled calendar is no longer accessible. Update calendar settings.');
      let pageToken = '';
      do {
        const query = new URLSearchParams({ timeMin: range.start, timeMax: range.end, singleEvents: 'true', orderBy: 'startTime', showDeleted: 'false', maxResults: '2500' });
        if (pageToken) query.set('pageToken', pageToken);
        const data = await this.request(`calendars/${encodeURIComponent(calendar.id)}/events?${query}`);
        for (const raw of data.items ?? []) {
          const event = normalizeEvent(raw, calendar, policy, resources);
          if (event) all.push(event);
        }
        pageToken = data.nextPageToken ?? '';
      } while (pageToken);
    }
    return all.sort((a, b) => instant(a.start) - instant(b.start) || a.key.localeCompare(b.key));
  }
  async get(calendarId: string, eventId: string): Promise<RawEvent | null> {
    try { return await this.request(`calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`); }
    catch (error) { if (error instanceof CalendarError && [404, 410].includes(error.status)) return null; throw error; }
  }
  async insert(calendarId: string, body: Record<string, unknown>): Promise<RawEvent> {
    return this.request(`calendars/${encodeURIComponent(calendarId)}/events`, { method: 'POST', body: JSON.stringify(body) });
  }
}
export function syncPolicies(state: AccountState, calendars: CalendarInfo[]): void {
  for (const calendar of calendars) if (!state.policies.some(p => p.calendarId === calendar.id)) state.policies.push(defaultPolicy(calendar));
}
