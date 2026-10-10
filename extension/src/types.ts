import type { ShortcutAction } from './shortcuts';
export const ATTENTION = 'attention';
export const MINUTE = 60_000;
export interface TimeWindow { start: string; end: string }
export interface Resource { id: string; name: string }
export interface Placement extends TimeWindow { draftId: string }
export interface ApplyRecord { calendarId: string; eventId: string; placement: Placement; body: Record<string, unknown>; confirmed?: boolean }
export interface DraftEvent {
  id: string; title: string; durationMinutes: number; description: string; location: string;
  calendarId: string; resourceIds: string[]; windows: TimeWindow[];
  selected: boolean; state: 'pending' | 'applied'; applyRecord?: ApplyRecord;
}
export interface CalendarPolicy {
  calendarId: string; enabled: boolean; visible: boolean; mode: 'block' | 'visual'; resourceIds: string[];
}
export interface CalendarInfo { id: string; summary: string; timeZone: string; accessRole: string; primary?: boolean; color?: string }
export interface ExistingEvent extends TimeWindow {
  key: string; id: string; calendarId: string; title: string; allDay: boolean;
  resourceIds: string[]; htmlLink?: string; unavailableDetails?: boolean;
}
export interface ConflictException extends TimeWindow {
  id: string; eventKey: string; eventStart: string; eventEnd: string; draftIds: string[];
}
export interface SolverRequest {
  events: DraftEvent[]; busy: ExistingEvent[]; exceptions: ConflictException[]; now: string;
  model: string; timeLimitSeconds?: number;
}
export interface SolverResult {
  status: 'optimal' | 'feasible' | 'infeasible' | 'timeout' | 'error' | 'cancelled';
  placements: Placement[]; diagnostics: string[]; objectiveEnd?: string;
}
export interface AvailabilityPreset { id: string; name: string; slots: { weekday: number; startMinute: number; endMinute: number }[] }
export interface AccountState {
  version: 1; revision: number; drafts: DraftEvent[]; resources: Resource[]; policies: CalendarPolicy[];
  exceptions: ConflictException[]; presets: AvailabilityPreset[]; lastCalendarId: string;
  timeZone: string; timezoneConfirmed: boolean;
  proposal?: { revision: number; request: SolverRequest; result: SolverResult };
}
export interface CalendarView { dates: string[]; timeZone?: string; supported: boolean; reason?: string }
export type PanelMessage =
  | { type: 'shortcut'; action: ShortcutAction }
  | { type: 'view'; view: CalendarView }
  | { type: 'window'; draftId: string; window: TimeWindow; index?: number }
  | { type: 'delete-window'; draftId: string; index: number }
  | { type: 'drawing-ended' };
export interface OverlayState {
  type: 'overlay'; draftId?: string; drawing: boolean; timeZone: string; timezoneConfirmed: boolean;
  windows: TimeWindow[]; placements: Placement[];
  focusCalendar?: boolean;
}
