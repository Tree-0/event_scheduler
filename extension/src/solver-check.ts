import { startSolver } from './solver-client';
import type { SolverRequest } from './types';
const w = { start: '2030-01-01T10:00:00Z', end: '2030-01-01T12:00:00Z' };
const request: SolverRequest = {
  events: [['a', ['x', 'y']], ['b', ['x']], ['c', ['y']]].map(([id, resourceIds]) => ({ id: id as string, resourceIds: resourceIds as string[], title: id as string, durationMinutes: 30, description: '', location: '', calendarId: 'primary', windows: [w], selected: true, state: 'pending' })),
  busy: [], exceptions: [], now: '2030-01-01T00:00:00Z', model: 'makespan',
};
Object.assign(window, { startSolver });
startSolver(request).result.then(result => {
  document.querySelector('#result')!.textContent = JSON.stringify({ isolated: crossOriginIsolated, ...result });
});
