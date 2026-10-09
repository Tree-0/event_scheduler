import { dateInZone, localMinutes, localInstant, addDays, weekStart } from './time';
import { Temporal } from '@js-temporal/polyfill';
import type { AvailabilityPreset, TimeWindow } from './types';
export function createPreset(name: string, windows: TimeWindow[], zone: string): AvailabilityPreset {
  if (!name.trim() || !windows.length) throw new Error('Name the preset and draw at least one window.');
  const slots = windows.map(w => {
    const date = dateInZone(w.start, zone), endDate = dateInZone(w.end, zone);
    const days = Temporal.PlainDate.from(date).until(Temporal.PlainDate.from(endDate)).days;
    if (days > 1) throw new Error('Presets support windows up to one day long.');
    const startMinute = localMinutes(w.start, zone), endMinute = localMinutes(w.end, zone) + days * 1440;
    if (endMinute - startMinute > 1440) throw new Error('Presets support windows up to one day long.');
    return { weekday: Temporal.PlainDate.from(date).dayOfWeek % 7, startMinute, endMinute };
  });
  return { id: crypto.randomUUID(), name: name.trim(), slots };
}
export function expandPreset(preset: AvailabilityPreset, viewedDate: string, zone: string): TimeWindow[] {
  const start = weekStart(viewedDate);
  return preset.slots.map(slot => ({ start: localInstant(addDays(start, slot.weekday), slot.startMinute, zone), end: localInstant(addDays(start, slot.weekday), slot.endMinute, zone) }));
}
