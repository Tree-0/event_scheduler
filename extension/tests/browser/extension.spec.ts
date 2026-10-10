import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('packaged extension solves with local WASM and supports cancellation', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'calendar-extension-'));
  const extension = resolve('dist');
  const context = await chromium.launchPersistentContext(profile, {
    headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? chromium.executablePath(),
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    const page = await context.newPage();
    const external: string[] = [];
    page.on('request', req => { if (/^https?:/.test(req.url())) external.push(req.url()); });
    await page.goto(`chrome-extension://${id}/solver-check.html`);
    await expect(page.locator('#result')).toContainText('"status":', { timeout: 45_000 });
    const result = JSON.parse(await page.locator('#result').innerText());
    expect(result.status, result.diagnostics.join('\n')).toBe('optimal');
    expect(result.isolated).toBe(true);
    expect(result.placements).toHaveLength(3);
    expect(result.objectiveEnd).toBe('2030-01-01T11:00:00.000Z');
    expect(external).toEqual([]);
    const exact = await page.evaluate(async () => {
      const event = (id: string, durationMinutes: number, resourceIds: string[], windows: { start: string; end: string }[]) => ({
        id, title: id, durationMinutes, resourceIds, windows, description: '', location: '', calendarId: 'primary', selected: true, state: 'pending',
      });
      return (window as any).startSolver({
        events: [
          event('attention', 37, ['attention'], [{ start: '2030-01-01T10:00:00Z', end: '2030-01-01T10:30:00Z' }, { start: '2030-01-01T11:00:00Z', end: '2030-01-01T12:00:00Z' }]),
          event('background', 45, ['machine'], [{ start: '2030-01-01T11:00:00Z', end: '2030-01-01T12:00:00Z' }]),
        ], busy: [], exceptions: [], now: '2030-01-01T00:00:00Z', model: 'makespan',
      }).result;
    });
    expect(exact.status, exact.diagnostics.join('\n')).toBe('optimal');
    expect(exact.placements).toEqual([
      { draftId: 'attention', start: '2030-01-01T11:00:00.000Z', end: '2030-01-01T11:37:00.000Z' },
      { draftId: 'background', start: '2030-01-01T11:00:00.000Z', end: '2030-01-01T11:45:00.000Z' },
    ]);
    expect(external).toEqual([]);
    const cancelled = await page.evaluate(async () => {
      const job = (window as any).startSolver({ events: [], busy: [], exceptions: [], now: '2030-01-01T00:00:00Z', model: 'makespan' });
      job.cancel(); return job.result;
    });
    expect(cancelled.status).toBe('cancelled');
  } finally { await context.close(); await rm(profile, { recursive: true, force: true }); }
});

test('packaged panel connects and drawing recovers from transient Calendar layouts', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'calendar-extension-'));
  const extension = resolve('dist');
  const context = await chromium.launchPersistentContext(profile, {
    headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? chromium.executablePath(),
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    // Serve a local Calendar layout through routing; no Google account or
    // Calendar reads/writes are used by this browser integration test.
    await context.route('https://calendar.google.com/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body>
      <style>main{position:relative;height:600px;width:800px}.loading{display:none}.hour{position:absolute;left:40px;width:40px;height:12px;font:12px/12px sans-serif}</style>
      <main><div id="calendar-grid" role="grid" data-timezone="UTC" style="position:absolute;left:100px;top:100px;width:700px;height:500px;overflow:auto">
        ${Array.from({ length: 7 }, (_, i) => `<div data-date="2030-01-${String(6 + i).padStart(2, '0')}" style="position:absolute;left:${i * 100}px;top:0;width:100px;height:1440px"></div>`).join('')}
      </div>${['12 AM', '1 AM', '2 AM', '3 AM'].map((label, i) => `<span class="hour" data-label="${label}" style="top:${94 + i * 60}px">${label}</span>`).join('')}</main>
      </body></html>` }));
    await context.route('https://www.googleapis.com/calendar/v3/**', route => route.fulfill({ contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*', 'cross-origin-resource-policy': 'cross-origin' },
      body: JSON.stringify({ items: route.request().url().includes('calendarList') ? [{ id: 'browser-check@example.invalid', summary: 'Test calendar', primary: true, accessRole: 'owner', timeZone: 'UTC' }] : [] }) }));
    const calendar = await context.newPage(); await calendar.goto('https://calendar.google.com/calendar/u/0/r/week');
    const panel = await context.newPage();
    await panel.addInitScript(() => {
      chrome.identity.getAuthToken = async () => ({ token: 'browser-test-token' }) as any;
      const query = chrome.tabs.query.bind(chrome.tabs);
      // This tab exercises the panel document that normally lives in Chrome's
      // side panel, where the selected tab would remain the Calendar webpage.
      chrome.tabs.query = (() => query({ url: 'https://calendar.google.com/*' })) as typeof chrome.tabs.query;
      const get = chrome.tabs.get.bind(chrome.tabs);
      chrome.tabs.get = (async (tabId: number) => {
        const tab = await get(tabId);
        return tab.url?.startsWith('chrome-extension://') ? (await query({ url: 'https://calendar.google.com/*' }))[0] : tab;
      }) as typeof chrome.tabs.get;
    });
    await panel.goto(`chrome-extension://${id}/panel.html`);
    await panel.getByRole('button', { name: 'Connect Google Calendar' }).click();
    await expect(panel.getByText('browser-check@example.invalid', { exact: true })).toBeVisible();
    await calendar.keyboard.press('Alt+Shift+N');
    const title = panel.locator('[data-focus-key="Title"]');
    await expect(title).toBeFocused();
    await title.fill('First keyboard draft');
    await title.press('Tab');
    await expect(panel.locator('[data-focus-key="Duration · minutes"]')).toBeFocused();
    const draw = panel.getByRole('button', { name: 'Draw availability on Calendar', exact: true });
    await expect(draw).toBeEnabled();
    await calendar.keyboard.press('Alt+Shift+D');
    await expect(panel.getByRole('button', { name: 'Finish drawing', exact: true })).toBeVisible();
    await calendar.mouse.move(160, 170); await calendar.mouse.down();
    await calendar.mouse.move(160, 230); await calendar.mouse.up();
    await expect(panel.locator('.window-list .row')).toHaveCount(1);
    await calendar.keyboard.press('Alt+Shift+D');
    await expect(draw).toBeVisible();
    await calendar.keyboard.press('Alt+Shift+N');
    await expect(title).toBeFocused(); await title.fill('Second keyboard draft');
    await title.press('Alt+Shift+ArrowUp'); await expect(title).toHaveValue('First keyboard draft');
    await calendar.keyboard.press('Alt+Shift+ArrowDown'); await expect(title).toHaveValue('Second keyboard draft');
    await calendar.evaluate(() => document.querySelector('#calendar-grid')!.classList.add('loading'));
    await expect(draw).toBeDisabled();
    await panel.getByRole('button', { name: 'Recheck Calendar view', exact: true }).click();
    await calendar.evaluate(() => document.querySelector('#calendar-grid')!.classList.remove('loading'));
    await expect(draw).toBeEnabled();
    await calendar.evaluate(() => document.querySelectorAll('.hour').forEach(e => { e.firstChild!.nodeValue = 'Loading'; }));
    await expect(draw).toBeDisabled();
    await calendar.evaluate(() => document.querySelectorAll<HTMLElement>('.hour').forEach(e => { e.firstChild!.nodeValue = e.dataset.label!; }));
    await expect(draw).toBeEnabled();
  } finally { await context.close(); await rm(profile, { recursive: true, force: true }); }
});
