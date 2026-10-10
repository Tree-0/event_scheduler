import './panel.css';
import { ATTENTION, type AccountState, type CalendarInfo, type CalendarView, type DraftEvent, type ExistingEvent, type OverlayState, type PanelMessage, type SolverRequest } from './types';
import { AccountStore, initialState, newDraft } from './store';
import { GoogleCalendar, syncPolicies, writable } from './calendar';
import { startSolver } from './solver-client';
import { validateRequest, validatePlacements } from './constraints';
import { addDays, dateStart, formatTime, inputInstant, localInput, rangeOf, validZone } from './time';
import { createPreset, expandPreset } from './presets';
import { applySchedule } from './apply';
import { shortcutAction, type ShortcutAction } from './shortcuts';

const root = document.querySelector('#app')!;
const store = new AccountStore();
let state: AccountState = initialState(), account = '', connected = false;
let calendars: CalendarInfo[] = [], agenda: ExistingEvent[] = [];
let selectedId = '', drawing = false, working = false, agendaLoading = false;
let status = 'Connect Google Calendar to get started.', statusError = false;
let view: CalendarView = { dates: [], supported: false, reason: 'Open Google Calendar in a day or week view.' };
let port: chrome.runtime.Port | undefined, tabId: number | undefined;
let job: ReturnType<typeof startSolver> | undefined;
let agendaGeneration = 0;
let tabGeneration = 0;
const api = new GoogleCalendar(async (interactive = false) => {
  const auth = await chrome.identity.getAuthToken({ interactive });
  if (!auth.token) throw new Error('Google authorization did not return a token.'); return auth.token;
}, token => chrome.identity.removeCachedAuthToken({ token }));

type Child = Node | string | null | undefined;
function el(tag: string, attrs: Record<string, string> = {}, ...children: Child[]): HTMLElement {
  const node = document.createElement(tag); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  for (const child of children) if (child != null) node.append(child); return node;
}
function button(text: string, fn: () => unknown, disabled = false, kind = 'secondary'): HTMLButtonElement {
  const node = el('button', { type: 'button', class: kind }, text) as HTMLButtonElement; node.disabled = disabled;
  node.onclick = () => { try { const result = fn(); if (result instanceof Promise) result.catch(fail); } catch (error) { fail(error); } }; return node;
}
let tooltipId = 0;
function tooltip(label: string, text: string) {
  const id = `help-tooltip-${++tooltipId}`;
  const trigger = button('?', () => {}, false, 'help-trigger');
  trigger.setAttribute('aria-label', label); trigger.setAttribute('aria-describedby', id);
  const help = el('span', { class: 'help' }, trigger, el('span', { id, class: 'help-tooltip', role: 'tooltip' }, text));
  help.onmouseenter = () => help.classList.remove('dismissed');
  trigger.onfocus = () => help.classList.remove('dismissed');
  trigger.onkeydown = event => { if (event.key === 'Escape') { help.classList.add('dismissed'); trigger.blur(); event.stopPropagation(); } };
  return help;
}
function note(message: string, error = false) { status = message; statusError = error; render(); }
function fail(error: unknown) { note(error instanceof Error ? error.message : String(error), true); }
function draft(): DraftEvent | undefined { return state.drafts.find(d => d.id === selectedId && d.state === 'pending'); }
function locked() { return working || state.drafts.some(d => d.state === 'pending' && d.applyRecord); }
function focusTitle() {
  const title = root.querySelector<HTMLInputElement>('[data-focus-key="Title"]');
  window.focus();
  title?.focus(); title?.setSelectionRange(title.value.length, title.value.length);
}
function createDraft() {
  if (!connected || locked()) return;
  const event = newDraft(state); state.drafts.push(event); selectedId = event.id; drawing = false; changed(); focusTitle();
}
function selectDraft(id: string, focus = false) {
  selectedId = id; drawing = false; render(); sendOverlay(); if (focus) focusTitle();
}
function canDraw() { return Boolean(draft() && view.supported && (state.timezoneConfirmed || view.timeZone)); }
function toggleDrawing(focusCalendar = false) {
  if (!connected || locked()) return;
  if (!drawing && !canDraw()) {
    note(!draft() ? 'Create or select a pending draft before drawing.' : !view.supported ? view.reason || 'Open a Calendar day or week view.' : 'Confirm the Calendar timezone in settings before drawing.', true);
    return;
  }
  drawing = !drawing;
  if (drawing && focusCalendar) (document.activeElement as HTMLElement | null)?.blur();
  render(); sendOverlay(drawing && focusCalendar);
}
function performShortcut(action: ShortcutAction) {
  if (!connected || locked()) return;
  if (action === 'new-draft') createDraft();
  else if (action === 'toggle-drawing') toggleDrawing(true);
  else {
    const pending = state.drafts.filter(d => d.state === 'pending'); if (!pending.length) return;
    const index = pending.findIndex(d => d.id === selectedId), direction = action === 'previous-draft' ? -1 : 1;
    const next = index < 0 ? 0 : (index + direction + pending.length) % pending.length;
    selectDraft(pending[next].id, true);
  }
}
async function persist() { if (account) await store.save(account, state); }
function changed(redraw = true) {
  state.revision++; state.proposal = undefined;
  void persist().catch(fail); sendOverlay(); if (redraw) render();
}
function field(label: string, value: string, set: (value: string) => void, options: { multiline?: boolean; type?: string; disabled?: boolean } = {}) {
  const input = document.createElement(options.multiline ? 'textarea' : 'input') as HTMLInputElement;
  input.dataset.focusKey = label;
  if (!options.multiline) input.type = options.type ?? 'text';
  input.value = value; input.disabled = options.disabled ?? locked();
  if (input.type === 'number') { input.min = '1'; input.step = '1'; }
  input.oninput = () => { set(input.value); changed(false); };
  // Let native Tab focus the next field before replacing the form controls.
  input.onchange = () => requestAnimationFrame(render);
  return el('label', { class: 'field' }, el('span', {}, label), input);
}
function check(label: string, checked: boolean, set: (value: boolean) => void, disabled = locked()) {
  const input = document.createElement('input'); input.type = 'checkbox'; input.checked = checked; input.disabled = disabled;
  input.onchange = () => { set(input.checked); changed(); void refreshAgenda().catch(fail); };
  return el('label', { class: 'check' }, input, label);
}
function select(label: string, value: string, choices: { value: string; text: string }[], set: (value: string) => void, disabled = locked()) {
  const input = document.createElement('select'); input.disabled = disabled;
  for (const choice of choices) { const option = document.createElement('option'); option.value = choice.value; option.textContent = choice.text; option.selected = choice.value === value; input.append(option); }
  input.onchange = () => { set(input.value); changed(); void refreshAgenda().catch(fail); };
  return el('label', { class: 'field' }, el('span', {}, label), input);
}
function section(title: string, ...children: Child[]) { return el('section', {}, el('h2', {}, title), ...children); }
function resourceChecks(ids: string[], set: (ids: string[]) => void) {
  return el('div', { class: 'resources' }, ...state.resources.map(r => check(r.name, ids.includes(r.id), value => set(value ? [...ids, r.id] : ids.filter(id => id !== r.id)))));
}
function sendOverlay(focusCalendar = false) {
  const current = draft();
  const message: OverlayState = { type: 'overlay', draftId: current?.id, drawing: drawing && !locked(), timeZone: state.timeZone,
    timezoneConfirmed: state.timezoneConfirmed, windows: current?.windows ?? [],
    placements: state.proposal?.result.placements.filter(p => state.drafts.some(d => d.id === p.draftId && d.state === 'pending')) ?? [], focusCalendar };
  try { port?.postMessage(message); } catch { port = undefined; }
}
async function attachTab(id?: number, force = false) {
  const generation = ++tabGeneration;
  const tab = id ? await chrome.tabs.get(id) : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (generation !== tabGeneration) return;
  if (!force && tab?.id === tabId && port && tab.url?.startsWith('https://calendar.google.com/')) return;
  port?.disconnect(); port = undefined; drawing = false;
  tabId = tab?.id;
  if (!tab?.id || !tab.url?.startsWith('https://calendar.google.com/')) { view = { supported: false, dates: [], reason: 'Open Google Calendar to draw windows.' }; render(); return; }
  const connection = chrome.tabs.connect(tab.id, { name: 'calendar-panel' }); port = connection;
  connection.onDisconnect.addListener(() => { void chrome.runtime.lastError; if (port !== connection) return; port = undefined; view = { supported: false, dates: [], reason: 'Reload Google Calendar after loading or updating the extension.' }; drawing = false; render(); });
  connection.onMessage.addListener((message: PanelMessage) => {
    if (port !== connection) return;
    if (message.type === 'view') {
      view = message.view;
      if (view.timeZone && validZone(view.timeZone) && view.timeZone !== state.timeZone) { state.timeZone = view.timeZone; state.timezoneConfirmed = true; changed(false); }
      render(); void refreshAgenda().catch(fail);
    } else if (message.type === 'drawing-ended') { drawing = false; render(); }
    else if (message.type === 'shortcut') performShortcut(message.action);
    else if (!locked()) {
      const event = state.drafts.find(d => d.id === message.draftId && d.state === 'pending');
      if (!event) return;
      if (message.type === 'window') {
        if (message.index === undefined) event.windows.push(message.window); else event.windows[message.index] = message.window;
      } else event.windows.splice(message.index, 1);
      changed();
    }
  });
  sendOverlay();
}
async function connect(interactive = true) {
  if (working) return;
  working = true; render();
  try {
    const client = chrome.runtime.getManifest().oauth2?.client_id;
    if (!client || client.startsWith('configure-')) throw new Error('Set GOOGLE_CLIENT_ID in extension/.env.local, rebuild, and reload the extension. See the setup guide.');
    await chrome.identity.getAuthToken({ interactive });
    const list = await api.calendars();
    const primary = list.find(c => c.primary);
    if (!primary) throw new Error('The connected account has no accessible primary calendar.');
    const nextAccount = primary.id;
    if (nextAccount !== account) { state = await store.load(nextAccount); account = nextAccount; }
    calendars = list; connected = true; syncPolicies(state, calendars);
    if (!state.lastCalendarId || !calendars.some(c => c.id === state.lastCalendarId && writable(c))) state.lastCalendarId = calendars.find(c => c.primary && writable(c))?.id ?? calendars.find(writable)?.id ?? '';
    selectedId = state.drafts.find(d => d.state === 'pending')?.id ?? '';
    await chrome.storage.local.set({ lastAccount: account }); await persist();
    status = 'Choose calendars below, then create a flexible event.'; statusError = false;
    await refreshAgenda();
  } finally { working = false; render(); sendOverlay(); }
}
async function refreshAgenda() {
  if (!connected || !view.dates.length) return;
  const generation = ++agendaGeneration;
  const start = [...view.dates].sort()[0], end = addDays([...view.dates].sort().at(-1)!, 1);
  agendaLoading = true; render();
  try {
    const events = await api.events(calendars, state.policies, state.resources.map(r => r.id), { start: dateStart(start, state.timeZone), end: dateStart(end, state.timeZone) });
    if (generation === agendaGeneration) agenda = events;
  } catch (error) {
    if (generation === agendaGeneration) agenda = [];
    throw error;
  } finally { if (generation === agendaGeneration) { agendaLoading = false; render(); } }
}
async function schedule() {
  if (!connected || locked()) return;
  const events = structuredClone(state.drafts.filter(d => d.state === 'pending' && d.selected));
  const request: SolverRequest = { events, busy: [], exceptions: structuredClone(state.exceptions), now: new Date().toISOString(), model: 'makespan' };
  validateRequest(request);
  const revision = state.revision, owner = account;
  working = true; drawing = false; state.proposal = undefined; status = 'Refreshing commitments…'; statusError = false; render(); sendOverlay();
  try {
    calendars = await api.calendars();
    for (const event of events) if (!calendars.some(c => c.id === event.calendarId && writable(c))) throw new Error(`${event.title}: choose a writable destination.`);
    request.busy = await api.events(calendars, state.policies, state.resources.map(r => r.id), rangeOf(events.flatMap(e => e.windows)));
    status = 'Finding available times…'; job = startSolver(request); render();
    const result = await job.result;
    if (revision !== state.revision || owner !== account) throw new Error('Drafts changed during scheduling. Run Schedule again.');
    if (['optimal', 'feasible'].includes(result.status)) { validatePlacements(request, result); state.proposal = { revision, request, result }; await persist(); status = `${result.status === 'optimal' ? 'Optimal' : 'Feasible'} proposal ready. Review before applying.`; }
    else { status = result.diagnostics.join(' ') || result.status; statusError = !['cancelled'].includes(result.status); }
  } finally { job = undefined; working = false; render(); sendOverlay(); }
}
async function apply() {
  const proposal = state.proposal; if (!proposal || working) return;
  if (proposal.revision !== state.revision) throw new Error('Drafts changed. Schedule again.');
  working = true; drawing = false; status = 'Checking the proposal and applying…'; statusError = false; render(); sendOverlay();
  try {
    const result = await applySchedule(api, state, proposal.request, proposal.result, persist);
    const remaining = proposal.request.events.filter(e => state.drafts.some(d => d.id === e.id && d.state === 'pending'));
    if (!remaining.length) { state.proposal = undefined; state.revision++; }
    await persist();
    status = result.errors.length ? `${result.applied} applied. ${result.errors.join(' ')} Retry Apply to reconcile the interrupted write.` : `${result.applied} events applied. They are fixed commitments for subsequent runs.`;
    statusError = Boolean(result.errors.length); await refreshAgenda();
  } finally { working = false; selectedId = state.drafts.find(d => d.state === 'pending')?.id ?? ''; render(); sendOverlay(); }
}
async function resolveWrite(event: DraftEvent) {
  if (working || !event.applyRecord) return;
  const record = event.applyRecord;
  const raw = await api.get(record.calendarId, record.eventId);
  if (raw && raw.status !== 'cancelled') {
    const times = raw.start?.dateTime && raw.end?.dateTime ? `${formatTime(raw.start.dateTime, state.timeZone)} → ${formatTime(raw.end.dateTime, state.timeZone)}` : 'All-day event';
    if (!confirm(`Previous Calendar insertion: ${raw.summary || '(Untitled)'}\n${times}\n\nKeep this event as it is and archive this draft?`)) return;
    event.state = 'applied'; record.confirmed = true;
  } else {
    if (!confirm('No previous insertion is currently present. Release this draft for rescheduling? A retry will reuse the same Calendar event ID.')) return;
    delete event.applyRecord;
  }
  changed(); note('Previous write reconciled. Schedule remaining drafts again.');
}
function renderEditor(current: DraftEvent) {
  const editor = section('Event details', field('Title', current.title, value => { current.title = value; }),
    field('Duration · minutes', String(current.durationMinutes), value => { current.durationMinutes = Number(value); }, { type: 'number' }),
    field('Description', current.description, value => { current.description = value; }, { multiline: true }),
    field('Location', current.location, value => { current.location = value; }),
    select('Destination calendar', current.calendarId, [{ value: '', text: 'Choose a calendar' }, ...calendars.filter(writable).map(c => ({ value: c.id, text: c.summary }))], value => {
      current.calendarId = value; state.lastCalendarId = value;
      const policy = state.policies.find(p => p.calendarId === value); if (policy) policy.enabled = true;
    }),
    el('div', { class: 'help-row' },
      check('Runs in the background', !current.resourceIds.includes(ATTENTION), value => { current.resourceIds = value ? current.resourceIds.filter(id => id !== ATTENTION) : [...current.resourceIds, ATTENTION]; }),
      tooltip('About running in the background', 'Checking this removes “My attention” from the event, so it can run while you do something else. Other required resources still prevent overlaps.')),
    el('p', { class: 'muted' }, 'Required resources · any shared resource prevents overlap'), resourceChecks(current.resourceIds, ids => { current.resourceIds = ids; }));
  const drawingButton = button(drawing ? 'Finish drawing' : 'Draw availability on Calendar', () => toggleDrawing(), locked() || !canDraw(), 'primary');
  drawingButton.title = 'Toggle drawing · Alt/Option+Shift+D'; drawingButton.setAttribute('aria-keyshortcuts', 'Alt+Shift+D');
  editor.append(drawingButton);
  if (!canDraw()) {
    editor.append(el('p', { class: 'muted' }, view.supported ? 'Confirm the Calendar timezone in settings before drawing.' : view.reason));
    if (!view.supported) editor.append(button('Recheck Calendar view', () => attachTab(tabId, true), locked()));
  }
  const windows = el('div', { class: 'window-list' });
  current.windows.forEach((w, index) => windows.append(el('div', { class: 'row' }, el('span', {}, `${formatTime(w.start, state.timeZone)} → ${formatTime(w.end, state.timeZone)}`), button('Remove', () => { current.windows.splice(index, 1); changed(); }, locked()))));
  if (!current.windows.length) windows.append(el('p', { class: 'muted' }, 'Draw one or more windows. The entire event must fit inside one.'));
  editor.append(windows);
  editor.append(button('Duplicate draft', () => { const copy = structuredClone(current); copy.id = crypto.randomUUID(); delete copy.applyRecord; copy.title = current.title ? `${current.title} (copy)` : ''; state.drafts.push(copy); selectedId = copy.id; drawing = false; changed(); }, locked()));
  editor.append(button('Delete draft', () => { state.drafts = state.drafts.filter(d => d.id !== current.id); selectedId = state.drafts.find(d => d.state === 'pending')?.id ?? ''; drawing = false; changed(); }, locked()));
  const presetName = document.createElement('input'); presetName.placeholder = 'Preset name'; presetName.setAttribute('aria-label', 'Preset name'); presetName.disabled = locked();
  editor.append(el('div', { class: 'row' }, presetName, button('Save windows as preset', () => { state.presets.push(createPreset(presetName.value, current.windows, state.timeZone)); changed(); }, locked() || !current.windows.length)));
  for (const preset of state.presets) editor.append(el('div', { class: 'row' }, button(`Add ${preset.name}`, () => { current.windows.push(...expandPreset(preset, view.dates[0], state.timeZone)); changed(); }, locked() || !view.dates.length), button('Delete preset', () => { state.presets = state.presets.filter(p => p.id !== preset.id); changed(); }, locked())));
  return editor;
}
function renderAgenda() {
  const sectionNode = section('Existing events', button('Refresh', refreshAgenda, !connected || agendaLoading));
  if (agendaLoading) sectionNode.append(el('p', { class: 'muted' }, 'Loading events…'));
  if (!view.dates.length) sectionNode.append(el('p', { class: 'muted' }, 'Open a supported Calendar view to see its agenda here.'));
  const current = draft();
  for (const event of agenda.filter(e => state.policies.find(p => p.calendarId === e.calendarId)?.visible)) {
    const card = el('article', { class: 'agenda-event' }, el('strong', {}, event.title),
      el('p', {}, event.allDay ? `All day · ${formatTime(event.start, state.timeZone).split(',')[0]}` : `${formatTime(event.start, state.timeZone)} → ${formatTime(event.end, state.timeZone)}`),
      el('p', { class: 'muted' }, `${calendars.find(c => c.id === event.calendarId)?.summary ?? ''} · ${event.resourceIds.length ? 'Reserves ' + event.resourceIds.map(id => state.resources.find(r => r.id === id)?.name ?? id).join(', ') : 'Visual only / available'}`));
    if (current && event.resourceIds.length) {
      const details = el('details', { 'data-details-key': `exception:${event.key}` }, el('summary', {}, `Allow overlap for ${current.title || 'this draft'}`));
      const start = document.createElement('input'), end = document.createElement('input'); start.type = end.type = 'datetime-local';
      start.value = localInput(event.start, state.timeZone); end.value = localInput(event.end, state.timeZone);
      start.disabled = end.disabled = locked();
      details.append(el('label', { class: 'field' }, 'Exception starts', start), el('label', { class: 'field' }, 'Exception ends', end),
        button('Allow this portion for selected draft', () => {
          const s = inputInstant(start.value, state.timeZone), e = inputInstant(end.value, state.timeZone);
          if (Date.parse(e) <= Date.parse(s) || Date.parse(s) < Date.parse(event.start) || Date.parse(e) > Date.parse(event.end)) throw new Error('The exception must be a portion of this occurrence.');
          state.exceptions.push({ id: crypto.randomUUID(), eventKey: event.key, eventStart: event.start, eventEnd: event.end, draftIds: [current.id], start: s, end: e }); changed();
        }, locked())); card.append(details);
    }
    sectionNode.append(card);
  }
  for (const exception of state.exceptions) sectionNode.append(el('div', { class: 'exception' },
    el('span', {}, `Exception: ${state.drafts.filter(d => exception.draftIds.includes(d.id)).map(d => d.title).join(', ')} · ${formatTime(exception.start, state.timeZone)} → ${formatTime(exception.end, state.timeZone)}`),
    button('Remove exception', () => { state.exceptions = state.exceptions.filter(e => e.id !== exception.id); changed(); }, locked())));
  return sectionNode;
}
function renderSettings() {
  const details = el('details', { class: 'settings', 'data-details-key': 'settings' }, el('summary', {}, 'Calendars, resources & timezone'));
  const zone = document.createElement('input'); zone.value = state.timeZone; zone.setAttribute('aria-label', 'Google Calendar timezone'); zone.dataset.focusKey = 'zone'; zone.disabled = locked();
  details.append(el('p', { class: 'muted' }, 'Match Google Calendar’s displayed timezone. Confirm once if the page does not expose it.'),
    el('div', { class: 'row' }, zone, button('Confirm timezone', () => { if (!validZone(zone.value)) throw new Error('Enter an IANA timezone, for example America/Chicago.'); state.timeZone = zone.value; state.timezoneConfirmed = true; changed(); }, locked())));
  details.append(el('h3', { class: 'help-row' }, 'Resources',
    tooltip('About scheduling resources', 'Resources are things an event needs, like your attention or a washing machine. Events that share a resource cannot overlap, and an event can need several resources.')));
  const name = document.createElement('input'); name.placeholder = 'Resource name'; name.setAttribute('aria-label', 'Resource name'); name.disabled = locked();
  details.append(el('div', { class: 'row' }, name, button('Add resource', () => { if (!name.value.trim()) throw new Error('Name the resource.'); state.resources.push({ id: crypto.randomUUID(), name: name.value.trim() }); changed(); }, locked())));
  for (const resource of state.resources.filter(r => r.id !== ATTENTION)) details.append(el('div', { class: 'row' }, el('span', {}, resource.name), button('Remove resource', () => {
    if (state.drafts.some(d => d.resourceIds.includes(resource.id)) || state.policies.some(p => p.resourceIds.includes(resource.id))) throw new Error('Remove this resource from its drafts and calendars first.');
    state.resources = state.resources.filter(r => r.id !== resource.id); changed();
  }, locked())));
  for (const calendar of calendars) {
    const policy = state.policies.find(p => p.calendarId === calendar.id)!;
    const card = el('article', { class: 'calendar-policy' }, el('strong', {}, calendar.summary),
      check('Use this calendar', policy.enabled, value => { policy.enabled = value; }),
      check('Show in extension agenda', policy.visible, value => { policy.visible = value; }),
      select('Conflict behavior', policy.mode, [{ value: 'block', text: 'Block selected resources' }, { value: 'visual', text: 'Visual only' }], value => { policy.mode = value as 'block' | 'visual'; }));
    if (policy.mode === 'block') card.append(resourceChecks(policy.resourceIds, ids => { policy.resourceIds = ids; }));
    card.append(el('p', { class: 'muted' }, 'Hiding the agenda does not remove resource constraints.')); details.append(card);
  }
  return details;
}
function render() {
  const opened = new Set([...root.querySelectorAll<HTMLDetailsElement>('details[open][data-details-key]')].map(d => d.dataset.detailsKey));
  const focused = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
  const focusKey = focused?.dataset.focusKey;
  const selection = focused && ['INPUT', 'TEXTAREA'].includes(focused.tagName) ? [focused.selectionStart, focused.selectionEnd] : undefined;
  root.replaceChildren(el('header', {}, el('div', { class: 'eyebrow' }, 'GOOGLE CALENDAR'), el('h1', {}, 'Window Scheduler'), el('p', {}, 'Draw possibilities. Find a schedule.')));
  const connection = el('div', { class: 'connection' }, el('span', {}, connected ? account : account ? `${account} · reconnect` : 'No account connected'), button(connected ? 'Reconnect' : 'Connect Google Calendar', () => connect(), working, 'secondary'));
  root.append(connection, el('p', { class: statusError ? 'status error' : 'status', role: statusError ? 'alert' : 'status' }, status));
  if (!account) { root.append(el('p', { class: 'muted' }, 'Your drafts and settings stay on this browser. Calendar reads and writes use your connected Google account.')); return; }
  root.append(renderSettings());
  const newButton = button('+ Flexible event', createDraft, !connected || locked(), 'primary');
  newButton.title = 'New draft · Alt/Option+Shift+N'; newButton.setAttribute('aria-keyshortcuts', 'Alt+Shift+N');
  const list = section('Pending drafts', newButton,
    el('p', { class: 'muted' }, 'New: Alt/Option+Shift+N · Draw: Alt/Option+Shift+D · Switch drafts: Alt/Option+Shift+↑/↓'));
  for (const event of state.drafts.filter(d => d.state === 'pending')) list.append(el('div', { class: event.id === selectedId ? 'draft-row selected' : 'draft-row' },
    check('Include', event.selected, value => { event.selected = value; }), button(`${event.title || 'Untitled draft'} · ${event.durationMinutes} min`, () => selectDraft(event.id)),
    event.applyRecord ? el('div', {}, el('small', {}, 'Write recovery pending · Retry Apply'), button('Inspect previous insertion', () => resolveWrite(event), working)) : null));
  root.append(list);
  const current = draft(); if (current) root.append(renderEditor(current));
  const actions = section('Schedule', el('p', { class: 'muted' }, 'Makespan · finish the last event earliest'),
    button('Schedule selected drafts', schedule, !connected || locked() || !state.drafts.some(d => d.state === 'pending' && d.selected), 'primary'));
  if (job) actions.append(button('Cancel', () => job?.cancel()));
  const proposal = state.proposal;
  if (proposal) {
    for (const placement of proposal.result.placements) actions.append(el('p', { class: 'placement' }, `${state.drafts.find(d => d.id === placement.draftId)?.title} · ${formatTime(placement.start, state.timeZone)} → ${formatTime(placement.end, state.timeZone)}`));
    actions.append(button('Apply proposal to Calendar', apply, !connected || working || proposal.revision !== state.revision, 'primary'));
    if (state.exceptions.length) actions.append(el('p', { class: 'muted' }, 'The proposal uses only the explicit exceptions listed below.'));
  }
  root.append(actions, renderAgenda());
  const applied = state.drafts.filter(d => d.state === 'applied');
  if (applied.length) root.append(el('details', {}, el('summary', {}, `${applied.length} applied events · fixed commitments`), ...applied.map(d => el('p', {}, d.title))));
  root.append(el('footer', {}, `Drawing timezone: ${state.timeZone} · Starts snap to 5 minutes.`));
  for (const detail of root.querySelectorAll<HTMLDetailsElement>('details[data-details-key]')) detail.open = opened.has(detail.dataset.detailsKey);
  if (focusKey) {
    const next = [...root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-focus-key]')].find(input => input.dataset.focusKey === focusKey);
    next?.focus(); if (next && selection?.[0] != null && selection[1] != null) next.setSelectionRange(selection[0], selection[1]);
  }
}
document.addEventListener('keydown', event => {
  const action = shortcutAction(event);
  if (action) {
    event.preventDefault(); event.stopImmediatePropagation();
    if (!event.repeat) { try { performShortcut(action); } catch (error) { fail(error); } }
  } else if (event.key === 'Escape' && drawing && !event.isComposing) {
    event.preventDefault(); drawing = false; render(); sendOverlay();
  }
});
chrome.tabs.onActivated.addListener(info => { void attachTab(info.tabId).catch(fail); });
chrome.tabs.onUpdated.addListener((id, change) => { if (id === tabId && change.status === 'complete') void attachTab(id, true).catch(fail); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !account || working) return;
  const next = changes[`account:${account}`]?.newValue as AccountState | undefined;
  if (next && next.revision > state.revision) { state = next; drawing = false; render(); sendOverlay(); }
});
render();
void (async () => {
  const last = (await chrome.storage.local.get('lastAccount')).lastAccount;
  if (typeof last === 'string') { account = last; state = await store.load(account); selectedId = state.drafts.find(d => d.state === 'pending')?.id ?? ''; render(); await connect(false); }
})().catch(fail);
void attachTab().catch(fail);
