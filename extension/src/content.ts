import { inspectGrid, gridPoint, type GridGeometry } from './grid';
import { localInstant, localMinutes, dateStart, addDays, instant } from './time';
import type { OverlayState, PanelMessage, TimeWindow } from './types';

const host = document.createElement('div');
host.id = 'window-scheduler-overlay';
host.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;';
document.documentElement.append(host);
const shadow = host.attachShadow({ mode: 'closed' });
const layer = document.createElement('div'); shadow.append(layer);
const style = document.createElement('style');
style.textContent = `.window{position:fixed;box-sizing:border-box;background:#087f8c26;border:2px solid #087f8c;border-radius:5px;color:#09545c;font:12px system-ui;overflow:hidden;pointer-events:auto}.preview{background:#ac710f30;border-color:#ac710f;pointer-events:none}.label{padding:5px 25px 5px 5px;pointer-events:none}.delete{position:absolute;right:2px;top:1px;border:0;background:white;color:#09545c;cursor:pointer}.handle{position:absolute;left:0;right:0;height:7px;background:#087f8c;cursor:ns-resize}.top{top:0}.bottom{bottom:0}.hit{position:fixed;pointer-events:auto;cursor:crosshair;background:transparent}.notice{position:fixed;bottom:12px;left:12px;padding:10px 14px;background:#172c30;color:white;border-radius:8px;font:13px system-ui;pointer-events:none}`;
shadow.append(style);
let state: OverlayState = { type: 'overlay', drawing: false, windows: [], placements: [], timeZone: 'UTC', timezoneConfirmed: false };
let geometry: GridGeometry | null = null;
let port: chrome.runtime.Port | undefined;
let lastView = '';
let drag: { start: { date: string; minute: number }; end: { date: string; minute: number }; index?: number; edge?: 'start' | 'end' } | undefined;
function send(message: PanelMessage) { try { port?.postMessage(message); } catch { port = undefined; } }
chrome.runtime.onConnect.addListener(p => {
  if (p.name !== 'calendar-panel') return;
  port?.disconnect(); port = p; lastView = '';
  p.onMessage.addListener((message: OverlayState) => { if (message.type !== 'overlay') return; state = message; drag = undefined; render(); });
  p.onDisconnect.addListener(() => { if (port === p) { port = undefined; state.drawing = false; drag = undefined; render(); } }); render();
});
function canDraw() { return geometry && (Boolean(geometry.view.timeZone) || state.timezoneConfirmed) && Boolean(state.draftId); }
function begin(event: PointerEvent, index?: number, edge?: 'start' | 'end') {
  if (!state.drawing || !canDraw() || event.button !== 0) return;
  const point = gridPoint(geometry!, event.clientX, event.clientY); if (!point) return;
  event.preventDefault(); event.stopImmediatePropagation(); drag = { start: point, end: point, index, edge }; renderWindows();
}
function draw(window: TimeWindow, kind: 'window' | 'preview', index?: number) {
  if (!geometry) return;
  const zone = geometry.view.timeZone ?? state.timeZone;
  for (const column of geometry.columns) {
    const dayStart = instant(dateStart(column.date, zone)), dayEnd = instant(dateStart(addDays(column.date, 1), zone));
    const start = Math.max(instant(window.start), dayStart), end = Math.min(instant(window.end), dayEnd); if (end <= start) continue;
    const startMinute = start === dayStart ? 0 : localMinutes(new Date(start).toISOString(), zone), endMinute = end === dayEnd ? 1440 : localMinutes(new Date(end).toISOString(), zone);
    const top = Math.max(geometry.top, geometry.minuteY + startMinute * geometry.pixelsPerMinute), bottom = Math.min(geometry.bottom, geometry.minuteY + endMinute * geometry.pixelsPerMinute); if (bottom <= top) continue;
    const element = document.createElement('div'); element.className = kind === 'preview' ? 'window preview' : 'window';
    element.style.cssText = `left:${column.left + 3}px;width:${column.right - column.left - 6}px;top:${top}px;height:${bottom - top}px;`;
    const label = document.createElement('div'); label.className = 'label'; label.textContent = kind === 'preview' ? 'Scheduled preview' : 'Available window'; element.append(label);
    if (kind === 'window' && index !== undefined && state.drawing) {
      const button = document.createElement('button'); button.className = 'delete'; button.textContent = '×'; button.title = 'Delete availability window';
      button.onclick = () => send({ type: 'delete-window', draftId: state.draftId!, index }); element.append(button);
      for (const edge of ['start', 'end'] as const) { const handle = document.createElement('div'); handle.className = `handle ${edge === 'start' ? 'top' : 'bottom'}`; handle.onpointerdown = e => begin(e, index, edge); element.append(handle); }
    } else element.style.pointerEvents = 'none';
    layer.append(element);
  }
}
function dragWindow(): TimeWindow | null {
  if (!drag || !geometry) return null;
  const zone = geometry.view.timeZone ?? state.timeZone;
  try {
    const first = localInstant(drag.start.date, drag.start.minute, zone), last = localInstant(drag.end.date, drag.end.minute, zone);
    if (drag.index !== undefined) { const old = state.windows[drag.index]; if (!old) return null; const result = { ...old, [drag.edge!]: last }; return instant(result.end) > instant(result.start) ? result : null; }
    if (first === last) return null;
    return instant(first) < instant(last) ? { start: first, end: last } : { start: last, end: first };
  } catch { return null; }
}
function renderWindows() {
  layer.querySelectorAll('.window').forEach(e => e.remove());
  state.windows.forEach((window, index) => { if (index !== drag?.index) draw(window, 'window', index); });
  state.placements.forEach(p => draw(p, 'preview')); const pending = dragWindow(); if (pending) draw(pending, 'window');
}
function render() {
  if (drag) return;
  geometry = inspectGrid();
  const view = geometry?.view ?? { supported: false, dates: [], reason: 'Open an English Google Calendar day or week view with hourly labels. This layout cannot be mapped safely.' };
  const serialized = JSON.stringify(view); if (serialized !== lastView) { lastView = serialized; send({ type: 'view', view }); }
  layer.replaceChildren();
  if (state.drawing && canDraw()) for (const column of geometry!.columns) {
    const hit = document.createElement('div'); hit.className = 'hit'; hit.style.cssText = `left:${column.left}px;top:${geometry!.top}px;width:${column.right - column.left}px;height:${geometry!.bottom - geometry!.top}px;`;
    hit.onpointerdown = event => begin(event); layer.append(hit);
  }
  renderWindows();
  if (state.drawing) { const notice = document.createElement('div'); notice.className = 'notice'; notice.textContent = canDraw() ? 'Draw availability · Escape to finish' : geometry ? 'Confirm the calendar timezone in Window Scheduler.' : view.reason!; layer.append(notice); }
}
document.addEventListener('pointermove', event => {
  if (!drag || !geometry) return;
  const point = gridPoint(geometry, event.clientX, Math.max(geometry.top, Math.min(geometry.bottom, event.clientY)));
  if (point) { drag.end = point; event.preventDefault(); renderWindows(); }
}, true);
document.addEventListener('pointerup', event => {
  if (!drag) return; event.preventDefault(); event.stopImmediatePropagation();
  const window = dragWindow(), index = drag.index; drag = undefined;
  if (window) send({ type: 'window', draftId: state.draftId!, window, index }); render();
}, true);
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !state.drawing) return; event.preventDefault(); event.stopImmediatePropagation();
  if (drag) { drag = undefined; render(); } else { state.drawing = false; send({ type: 'drawing-ended' }); render(); }
}, true);
document.addEventListener('pointercancel', () => { drag = undefined; render(); }, true);
window.addEventListener('blur', () => { drag = undefined; render(); });
let scheduled = false;
function queueRender() { if (!scheduled) { scheduled = true; requestAnimationFrame(() => { scheduled = false; render(); }); } }
window.addEventListener('scroll', queueRender, true); window.addEventListener('resize', queueRender);
// Calendar can restore a transiently unmeasurable view by updating a text node
// or toggling visibility classes without adding/removing any elements.
new MutationObserver(queueRender).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true,
  attributeFilter: ['data-date', 'data-datekey', 'data-timezone', 'style', 'class', 'hidden', 'role', 'aria-hidden', 'aria-label'] });
new ResizeObserver(queueRender).observe(document.body);
void document.fonts?.ready.then(queueRender);
render();
