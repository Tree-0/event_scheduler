import { expect, test, vi } from 'vitest';
import { AccountStore, initialState } from '../src/store';
import { localInstant, inputInstant, instant } from '../src/time';
import { createPreset, expandPreset } from '../src/presets';
test('rejects missing and ambiguous DST wall times', () => {
  expect(() => localInstant('2030-03-10', 150, 'America/Chicago')).toThrow();
  expect(() => localInstant('2030-11-03', 90, 'America/Chicago')).toThrow();
  expect(() => inputInstant('2030-11-03T01:30', 'America/Chicago')).toThrow();
  expect(() => instant('2030-01-01T10:00:00')).toThrow('UTC offset');
});
test('availability presets expand into the viewed week, preserving wall hours', () => {
  const windows = [{ start: localInstant('2030-03-04', 540, 'America/Chicago'), end: localInstant('2030-03-04', 660, 'America/Chicago') }];
  const preset = createPreset('Work mornings', windows, 'America/Chicago');
  expect(expandPreset(preset, '2030-03-14', 'America/Chicago')).toEqual([{ start: '2030-03-11T14:00:00Z', end: '2030-03-11T16:00:00Z' }]);
});
test('account storage isolates drafts and captures each save before mutation', async () => {
  const data: Record<string, any> = {};
  vi.stubGlobal('chrome', { storage: { local: { get: async (key: string) => ({ [key]: data[key] }), set: async (value: Record<string, any>) => Object.assign(data, value) } } });
  const store = new AccountStore(), state = initialState();
  state.lastCalendarId = 'first'; const pending = store.save('alice', state); state.lastCalendarId = 'second';
  await pending; expect((await store.load('alice')).lastCalendarId).toBe('first');
  expect((await store.load('bob')).lastCalendarId).toBe('');
  vi.unstubAllGlobals();
});
