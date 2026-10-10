// @vitest-environment happy-dom
import { expect, test, vi } from 'vitest';
import { inspectGrid } from '../src/grid';
import type { GridGeometry } from '../src/grid';
import type { PanelMessage } from '../src/types';
vi.mock('../src/grid', () => ({ inspectGrid: vi.fn(), gridPoint: vi.fn() }));

test('view detection recovers after visibility classes and hour text change', async () => {
  document.body.innerHTML = '<main><span>10 AM</span></main>';
  const geometry: GridGeometry = { view: { supported: true, dates: ['2030-01-01'], timeZone: 'UTC' },
    columns: [{ date: '2030-01-01', left: 100, right: 500 }], minuteY: 100, pixelsPerMinute: 1, top: 100, bottom: 600 };
  const inspect = vi.mocked(inspectGrid); inspect.mockReturnValue(null);
  let connect!: (port: unknown) => void;
  vi.stubGlobal('chrome', { runtime: { onConnect: { addListener: (fn: typeof connect) => { connect = fn; } } } });
  const messages: PanelMessage[] = [];
  try {
    await import('../src/content');
    connect({ name: 'calendar-panel', postMessage: (message: PanelMessage) => messages.push(message), disconnect: () => {},
      onMessage: { addListener: () => {} }, onDisconnect: { addListener: () => {} } });
    const count = messages.length;
    const shortcut = new KeyboardEvent('keydown', { code: 'KeyN', altKey: true, shiftKey: true, cancelable: true });
    document.dispatchEvent(shortcut);
    expect(shortcut.defaultPrevented).toBe(true); expect(messages.at(-1)).toEqual({ type: 'shortcut', action: 'new-draft' });
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyN', altKey: true, shiftKey: true, repeat: true }));
    expect(messages).toHaveLength(count + 1);
    messages.pop();
    expect(messages.at(-1)).toMatchObject({ type: 'view', view: { supported: false } });
    inspect.mockReturnValue(geometry);
    document.querySelector('main')!.className = 'visible';
    await vi.waitFor(() => expect(messages.at(-1)).toMatchObject({ type: 'view', view: { supported: true } }));
    inspect.mockReturnValue(null);
    document.querySelector('main')!.className = 'loading';
    await vi.waitFor(() => expect(messages.at(-1)).toMatchObject({ type: 'view', view: { supported: false } }));
    inspect.mockReturnValue(geometry);
    document.querySelector('span')!.firstChild!.nodeValue = '11 AM';
    await vi.waitFor(() => expect(messages.at(-1)).toMatchObject({ type: 'view', view: { supported: true } }));
  } finally { vi.unstubAllGlobals(); }
});
