import { expect, test, vi } from 'vitest';
import { GoogleCalendar, normalizeEvent, eventBody, defaultPolicy } from '../src/calendar';
import { busy, event, at } from './helpers';
import type { CalendarInfo } from '../src/types';
const calendar: CalendarInfo = { id: 'primary', summary: 'Personal', primary: true, accessRole: 'owner', timeZone: 'America/Chicago' };
const policy = defaultPolicy(calendar);
const raw = { id: 'one', summary: 'Class', start: { dateTime: at(0) }, end: { dateTime: at(60) } };
test('default fetch preserves the browser receiver when loading account calendars', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async function(this: unknown, input, init) {
    if (this !== globalThis) throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
    expect(String(input)).toContain('/users/me/calendarList?');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token');
    return Response.json({ items: [calendar] });
  });
  try {
    const api = new GoogleCalendar(async () => 'token', async () => {});
    expect(await api.calendars()).toEqual([calendar]);
    expect(fetcher).toHaveBeenCalledOnce();
  } finally { fetcher.mockRestore(); }
});
test('Busy blocks attention; visual-only, Available, and declined events do not', () => {
  expect(normalizeEvent(raw, calendar, policy, ['attention'])!.resourceIds).toEqual(['attention']);
  expect(normalizeEvent(raw, calendar, { ...policy, mode: 'visual' }, ['attention'])!.resourceIds).toEqual([]);
  expect(normalizeEvent({ ...raw, transparency: 'transparent' }, calendar, policy, ['attention'])!.resourceIds).toEqual([]);
  expect(normalizeEvent({ ...raw, attendees: [{ self: true, responseStatus: 'declined' }] }, calendar, policy, ['attention'])!.resourceIds).toEqual([]);
  expect(normalizeEvent({ id: 'deleted', status: 'cancelled' }, calendar, policy, ['attention'])).toBeNull();
});
test('busy all-day events use exclusive end dates in their calendar timezone across DST', () => {
  const result = normalizeEvent({ id: 'day', start: { date: '2030-03-10' }, end: { date: '2030-03-11' } }, calendar, policy, ['attention'])!;
  expect(Date.parse(result.end) - Date.parse(result.start)).toBe(23 * 60 * 60_000); expect(result.resourceIds).toEqual(['attention']);
});
test('calendar resource mapping and managed passive metadata preserve equipment conflicts', () => {
  const mapping = { ...policy, resourceIds: ['machine'] };
  expect(normalizeEvent(raw, calendar, mapping, ['attention', 'machine'])!.resourceIds).toEqual(['machine']);
  const body = eventBody(event('laundry', 30, ['machine']), { draftId: 'laundry', start: at(0), end: at(30) }, 'validid');
  expect(body.transparency).toBe('transparent');
  expect(normalizeEvent(body, calendar, policy, ['attention', 'machine'])!.resourceIds).toEqual(['machine']);
  expect(normalizeEvent(body, calendar, { ...policy, mode: 'visual' }, ['attention', 'machine'])!.resourceIds).toEqual([]);
  expect(normalizeEvent(body, calendar, policy, ['attention'])!.resourceIds).toEqual(['attention']);
});
test('Calendar API paginates calendars and expanded recurring events', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ items: [{ ...calendar }], nextPageToken: 'page2' }))
    .mockResolvedValueOnce(Response.json({ items: [] }))
    .mockResolvedValueOnce(Response.json({ items: [raw], nextPageToken: 'more' }))
    .mockResolvedValueOnce(Response.json({ items: [{ ...raw, id: 'two' }] }));
  const api = new GoogleCalendar(async () => 'token', async () => {}, fetcher);
  const calendars = await api.calendars();
  const events = await api.events(calendars, [policy], ['attention'], busy('range', 0, 120));
  expect(events).toHaveLength(2);
  expect(fetcher.mock.calls[1][0]).toContain('pageToken=page2');
  expect(fetcher.mock.calls[2][0]).toContain('singleEvents=true');
  expect(fetcher.mock.calls[3][0]).toContain('pageToken=more');
});
test('401 invalidates token and retries once; revoked permissions remain errors', async () => {
  const invalidate = vi.fn();
  const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 401 })).mockResolvedValueOnce(Response.json({ items: [] }));
  const api = new GoogleCalendar(async () => 'expired', invalidate, fetcher);
  expect(await api.calendars()).toEqual([]); expect(invalidate).toHaveBeenCalledWith('expired');
  fetcher.mockResolvedValue(new Response('', { status: 403 }));
  await expect(api.calendars()).rejects.toThrow('denied');
});
test('hidden blocking calendars are queried, and query failure never means free time', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('', { status: 500 }));
  const api = new GoogleCalendar(async () => 'token', async () => {}, fetcher);
  await expect(api.events([calendar], [{ ...policy, visible: false }], ['attention'], busy('r', 0, 60))).rejects.toThrow(); expect(fetcher).toHaveBeenCalled();
});
