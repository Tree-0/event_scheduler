// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { PanelMessage, SolverRequest } from '../src/types';
vi.mock('../src/solver-client', () => ({ startSolver: (request: SolverRequest) => ({
  result: Promise.resolve({ status: 'optimal', diagnostics: [], placements: request.events.map(e => ({ draftId: e.id, start: e.windows[0].start, end: new Date(Date.parse(e.windows[0].start) + e.durationMinutes * 60_000).toISOString() })) }), cancel: () => {},
}) }));
let received: ((message: PanelMessage) => void)[];
let saved: Record<string, any>;
let conflicts: Record<string, any>[];
let inserted: Record<string, any>[];
let outgoing: Record<string, any>[];
let attach: ReturnType<typeof vi.fn>;
let keyboardListeners: EventListener[];
let listenerSpy: ReturnType<typeof vi.spyOn>;
function findButton(text: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find(b => b.textContent === text);
  if (!found) throw new Error(`Button not found: ${text}`); return found;
}
function input(label: string): HTMLInputElement {
  return [...document.querySelectorAll<HTMLLabelElement>('label')].find(l => l.querySelector('span')?.textContent === label)!.querySelector('input')!;
}
function type(label: string, value: string) { const field = input(label); field.value = value; field.dispatchEvent(new Event('input')); field.dispatchEvent(new Event('change')); }
function send(message: PanelMessage) { received.forEach(fn => fn(message)); }
beforeEach(async () => {
  vi.resetModules(); saved = {}; conflicts = []; inserted = []; outgoing = []; received = [];
  keyboardListeners = [];
  const listen = document.addEventListener.bind(document);
  listenerSpy = vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
    if (type === 'keydown' && typeof listener === 'function') keyboardListeners.push(listener);
    listen(type, listener, options);
  });
  document.body.innerHTML = '<div id="app"></div>';
  const noop = { addListener: () => {} };
  const port = { postMessage: (message: any) => outgoing.push(message), disconnect: () => {}, onDisconnect: noop, onMessage: { addListener: (fn: any) => received.push(fn) } };
  attach = vi.fn(() => port);
  vi.stubGlobal('chrome', {
    identity: { getAuthToken: async () => ({ token: 'test-token' }), removeCachedAuthToken: async () => {} },
    runtime: { getManifest: () => ({ oauth2: { client_id: 'test.apps.googleusercontent.com' } }), lastError: undefined },
    storage: { local: { get: async (key: string) => ({ [key]: saved[key] }), set: async (value: Record<string, any>) => Object.assign(saved, structuredClone(value)) }, onChanged: noop },
    tabs: { query: async () => [{ id: 1, url: 'https://calendar.google.com/' }], get: async () => ({ id: 1, url: 'https://calendar.google.com/' }), connect: attach, onActivated: noop, onUpdated: noop },
  });
  vi.stubGlobal('fetch', vi.fn(async function(this: unknown, url: string, init?: RequestInit) {
    if (this !== globalThis) throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
    if (url.includes('calendarList')) return Response.json({ items: [{ id: 'alice@example.com', summary: 'Personal', primary: true, accessRole: 'owner', timeZone: 'UTC' }] });
    if (init?.method === 'POST') { const body = JSON.parse(String(init.body)); inserted.push(body); return Response.json(body); }
    return Response.json({ items: conflicts });
  }));
  await import('../src/panel');
  findButton('Connect Google Calendar').click();
  await vi.waitFor(() => expect(document.body.textContent).toContain('alice@example.com'));
  send({ type: 'view', view: { supported: true, dates: ['2030-01-01'], timeZone: 'UTC' } });
});
afterEach(() => {
  keyboardListeners.forEach(listener => document.removeEventListener('keydown', listener)); listenerSpy.mockRestore();
  vi.unstubAllGlobals(); document.body.replaceChildren();
});
function hotkey(code: string, repeat = false) {
  const event = new KeyboardEvent('keydown', { code, altKey: true, shiftKey: true, repeat, bubbles: true, cancelable: true });
  (document.activeElement ?? document).dispatchEvent(event); return event;
}
async function createDraft() {
  await vi.waitFor(() => expect(findButton('+ Flexible event').disabled).toBe(false));
  findButton('+ Flexible event').click(); type('Title', 'Homework'); type('Duration · minutes', '30');
  const overlay = outgoing.at(-1)!;
  send({ type: 'window', draftId: overlay.draftId, window: { start: '2030-01-01T10:00:00Z', end: '2030-01-01T11:00:00Z' } });
  await vi.waitFor(() => expect(saved['account:alice@example.com']?.drafts[0].windows).toHaveLength(1));
}
test('creates, autosaves, paints, duplicates, and marks drafts as background', async () => {
  await createDraft(); findButton('Draw availability on Calendar').click(); expect(outgoing.at(-1)!.drawing).toBe(true);
  send({ type: 'drawing-ended' }); expect(findButton('Draw availability on Calendar')).toBeTruthy();
  findButton('Duplicate draft').click();
  const background = [...document.querySelectorAll('label')].find(l => l.textContent === 'Runs in the background')!.querySelector('input')!;
  background.checked = true; background.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(saved['account:alice@example.com'].drafts).toHaveLength(2));
  await vi.waitFor(() => expect(saved['account:alice@example.com'].drafts[1].resourceIds).toEqual([]));
  expect(saved['account:alice@example.com'].drafts[0].resourceIds).toEqual(['attention']);
});
test('keyboard creates focused drafts, toggles drawing, and cycles pending drafts without losing edits', async () => {
  await vi.waitFor(() => expect(findButton('+ Flexible event').disabled).toBe(false));
  expect(hotkey('KeyN').defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(input('Title'));
  type('Title', 'First draft');
  hotkey('KeyN', true);
  await vi.waitFor(() => expect(saved['account:alice@example.com'].drafts).toHaveLength(1));
  hotkey('KeyN'); type('Title', 'Second draft');
  hotkey('ArrowUp'); expect(input('Title').value).toBe('First draft');
  expect(document.activeElement).toBe(input('Title'));
  hotkey('ArrowDown'); expect(input('Title').value).toBe('Second draft');
  hotkey('ArrowDown'); expect(input('Title').value).toBe('First draft');
  hotkey('KeyD'); expect(outgoing.at(-1)!.drawing).toBe(true); expect(outgoing.at(-1)!.focusCalendar).toBe(true);
  hotkey('KeyD', true); expect(outgoing.at(-1)!.drawing).toBe(true);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(outgoing.at(-1)!.drawing).toBe(false);
  await vi.waitFor(() => expect(saved['account:alice@example.com'].drafts.map((d: any) => d.title)).toEqual(['First draft', 'Second draft']));
});
test('Calendar shortcuts share button guards and respect unsupported views and active work', async () => {
  await createDraft();
  send({ type: 'shortcut', action: 'new-draft' });
  await vi.waitFor(() => expect(saved['account:alice@example.com'].drafts).toHaveLength(2));
  expect(document.activeElement).toBe(input('Title'));
  send({ type: 'view', view: { supported: false, dates: [], reason: 'Unsupported view' } });
  send({ type: 'shortcut', action: 'toggle-drawing' }); expect(outgoing.at(-1)!.drawing).toBe(false);
  expect(document.querySelector('[role=alert]')?.textContent).toBe('Unsupported view');
  send({ type: 'view', view: { supported: true, dates: ['2030-01-01'], timeZone: 'UTC' } });
  send({ type: 'shortcut', action: 'previous-draft' });
  // Exclude the empty draft so this Schedule reaches the asynchronous work phase.
  findButton('Untitled draft · 30 min').click();
  const includes = [...document.querySelectorAll<HTMLInputElement>('.draft-row input')];
  includes[1].checked = false; includes[1].dispatchEvent(new Event('change'));
  findButton('Schedule selected drafts').click();
  send({ type: 'shortcut', action: 'new-draft' });
  send({ type: 'shortcut', action: 'toggle-drawing' });
  expect(outgoing.at(-1)!.drawing).toBe(false);
  await vi.waitFor(() => expect(saved['account:alice@example.com'].drafts).toHaveLength(2));
  await vi.waitFor(() => expect(findButton('Schedule selected drafts').disabled).toBe(false));
});
test('unsupported drawing exposes a recheck and enables drawing after the adapter recovers', async () => {
  await createDraft();
  send({ type: 'view', view: { supported: false, dates: [], reason: 'Calendar is updating its view.' } });
  expect(findButton('Draw availability on Calendar').disabled).toBe(true);
  expect(document.body.textContent).toContain('Calendar is updating its view.');
  const before = attach.mock.calls.length;
  findButton('Recheck Calendar view').click();
  await vi.waitFor(() => expect(attach.mock.calls.length).toBeGreaterThan(before));
  send({ type: 'view', view: { supported: true, dates: ['2030-01-01'], timeZone: 'UTC' } });
  expect(findButton('Draw availability on Calendar').disabled).toBe(false);
});
test('settings remain open through changes and calendar visibility does not disable blocking', async () => {
  const settings = document.querySelector<HTMLDetailsElement>('.settings')!; settings.open = true;
  const visible = [...document.querySelectorAll('label')].find(l => l.textContent === 'Show in extension agenda')!.querySelector('input')!;
  visible.checked = false; visible.dispatchEvent(new Event('change'));
  expect(document.querySelector<HTMLDetailsElement>('.settings')!.open).toBe(true);
  await vi.waitFor(() => expect(saved['account:alice@example.com'].policies[0].visible).toBe(false));
  expect(saved['account:alice@example.com'].policies[0].mode).toBe('block');
  expect(saved['account:alice@example.com'].policies[0].enabled).toBe(true);
});
test('preview saves and Apply rechecks a newly added commitment before writing', async () => {
  await createDraft(); findButton('Schedule selected drafts').click();
  await vi.waitFor(() => expect(findButton('Apply proposal to Calendar').disabled).toBe(false));
  expect(inserted).toHaveLength(0);
  await vi.waitFor(() => expect(saved['account:alice@example.com'].proposal).toBeTruthy());
  conflicts = [{ id: 'new-meeting', summary: 'Added after preview', start: { dateTime: '2030-01-01T10:00:00Z' }, end: { dateTime: '2030-01-01T10:30:00Z' } }];
  findButton('Apply proposal to Calendar').click();
  await vi.waitFor(() => expect(document.querySelector('[role=alert]')?.textContent).toContain('no longer available'));
  expect(inserted).toHaveLength(0);
});
