import { ATTENTION, type AccountState, type DraftEvent } from './types';

export function initialState(): AccountState {
  return { version: 1, revision: 0, drafts: [], resources: [{ id: ATTENTION, name: 'My attention' }], policies: [], exceptions: [], presets: [], lastCalendarId: '', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, timezoneConfirmed: false };
}
export function newDraft(state: AccountState): DraftEvent {
  return { id: crypto.randomUUID(), title: '', durationMinutes: 30, description: '', location: '', calendarId: state.lastCalendarId, resourceIds: [ATTENTION], windows: [], selected: true, state: 'pending' };
}
export class AccountStore {
  private saving = Promise.resolve();
  async load(account: string): Promise<AccountState> {
    const key = `account:${account}`;
    const raw = (await chrome.storage.local.get(key))[key] as AccountState | undefined;
    if (!raw) return initialState();
    if (raw.version !== 1) throw new Error('Stored drafts use an unsupported version. Export them before resetting storage.');
    return raw;
  }
  save(account: string, state: AccountState): Promise<void> {
    const snapshot = structuredClone(state);
    this.saving = this.saving.catch(() => {}).then(() => chrome.storage.local.set({ [`account:${account}`]: snapshot }));
    return this.saving;
  }
}
