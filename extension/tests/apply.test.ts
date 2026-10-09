import { expect, test, vi } from 'vitest';
import { applySchedule } from '../src/apply';
import { CalendarError, type CalendarApi } from '../src/calendar';
import { at, account, busy, event, proposal, request } from './helpers';
function api(): CalendarApi {
  return { calendars: vi.fn(async () => [{ id: 'primary', summary: 'Personal', timeZone: 'UTC', accessRole: 'owner' }]), events: vi.fn(async () => []), get: vi.fn(async () => null), insert: vi.fn(async (_id, body) => body) };
}
test('refreshes conflicts before any write and rejects a stale proposal', async () => {
  const drafts = [event('a')], state = account(drafts), service = api();
  vi.mocked(service.events).mockResolvedValue([busy('new meeting', 0, 30)]);
  await expect(applySchedule(service, state, request(drafts), proposal(drafts, [0]), async () => {}, at(-60))).rejects.toThrow('no longer available');
  expect(service.insert).not.toHaveBeenCalled();
});
test('checks current destination permissions', async () => {
  const drafts = [event('a')], service = api(); vi.mocked(service.calendars).mockResolvedValue([]);
  await expect(applySchedule(service, account(drafts), request(drafts), proposal(drafts, [0]), async () => {}, at(-60))).rejects.toThrow('writable');
  expect(service.insert).not.toHaveBeenCalled();
});
test('persists IDs before sending and reconciles a lost response without a duplicate', async () => {
  const drafts = [event('a'), event('b')], state = account(drafts), service = api();
  const schedule = proposal(drafts, [0, 30]); const req = structuredClone(request(drafts));
  let saved: typeof state | undefined, inserted: Record<string, unknown> | undefined;
  const persist = vi.fn(async () => { saved = structuredClone(state); });
  vi.mocked(service.insert).mockImplementationOnce(async (_id, body) => { expect(saved!.drafts[0].applyRecord!.eventId).toBe(body.id); inserted = body; throw new Error('Lost response'); });
  expect((await applySchedule(service, state, req, schedule, persist, at(-60))).errors).toHaveLength(1);
  expect(state.drafts[0].state).toBe('pending');
  vi.mocked(service.get).mockImplementation(async (_calendar, id) => id === inserted!.id ? inserted! : null);
  const outcome = await applySchedule(service, state, req, schedule, persist, at(-60));
  expect(outcome.errors).toEqual([]); expect(state.drafts.every(d => d.state === 'applied')).toBe(true);
  expect(service.insert).toHaveBeenCalledTimes(2); // first event once, second event once
});
test('409 retrieves and verifies the existing insertion', async () => {
  const drafts = [event('a')], state = account(drafts), service = api();
  vi.mocked(service.insert).mockRejectedValue(new CalendarError('Already exists', 409));
  vi.mocked(service.get).mockImplementation(async () => state.drafts[0].applyRecord?.body ?? null);
  const outcome = await applySchedule(service, state, request(drafts), proposal(drafts, [0]), async () => {}, at(-60));
  expect(outcome.applied).toBe(1); expect(outcome.errors).toEqual([]);
});
test('a manually modified uncertain insertion requires inspection', async () => {
  const drafts = [event('a')], state = account(drafts), service = api();
  vi.mocked(service.insert).mockRejectedValue(new Error('Lost response'));
  const req = structuredClone(request(drafts)), result = proposal(drafts, [0]);
  await applySchedule(service, state, req, result, async () => {}, at(-60));
  vi.mocked(service.get).mockResolvedValue({ ...state.drafts[0].applyRecord!.body, summary: 'Changed by hand' });
  await expect(applySchedule(service, state, req, result, async () => {}, at(-60))).rejects.toThrow('modified');
  expect(service.insert).toHaveBeenCalledTimes(1);
});
test('rejects proposals that omit an event or start in the past', async () => {
  const drafts = [event('a'), event('b')], state = account(drafts), service = api();
  await expect(applySchedule(service, state, request(drafts), proposal([drafts[0]], [0]), async () => {}, at(-60))).rejects.toThrow('every selected');
  await expect(applySchedule(service, state, request(drafts), proposal(drafts, [0, 30]), async () => {}, at(5))).rejects.toThrow('no longer available');
});
