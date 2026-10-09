import { describe, expect, test } from 'vitest';
import { solve } from '../src/solver';
import { validatePlacements } from '../src/constraints';
import { at, busy, event, request } from './helpers';

describe('CP-SAT scheduling', () => {
  test('shares any resource, without making conflicts transitive', async () => {
    const req = request([event('a', 30, ['x', 'y']), event('b', 30, ['x']), event('c', 30, ['y'])]);
    const result = await solve(req);
    expect(result.status).toBe('optimal'); expect(result.objectiveEnd).toBe(at(60));
    validatePlacements(req, result);
    const b = result.placements.find(p => p.draftId === 'b')!, c = result.placements.find(p => p.draftId === 'c')!;
    expect(b.start).toBe(c.start);
  });
  test('preserves exact duration with a stable five-minute start grid', async () => {
    const result = await solve(request([event('one', 17, ['attention'], 1, 29)]));
    expect(result.status, JSON.stringify(result)).toBe('optimal');
    expect(result.placements).toEqual([{ draftId: 'one', start: at(5), end: at(22) }]);
  });
  test('can place a one-minute event into an exactly fitting window', async () => {
    const result = await solve(request([event('a', 1, ['attention'], 0, 1)]));
    expect(result.status, JSON.stringify(result)).toBe('optimal'); expect(result.placements[0].end).toBe(at(1));
  });
  test('overlapping commitments block their union without conflicting with each other', async () => {
    const req = request([event('one')], [busy('x', 0, 30), busy('y', 15, 45)]);
    const result = await solve(req); expect(result.placements[0].start).toBe(at(45)); validatePlacements(req, result);
  });
  test('background activities can overlap attention, but not their equipment', async () => {
    const req = request([event('homework', 60), event('laundry', 60, ['machine']), event('laundry2', 60, ['machine'])], [busy('class', 60, 120)]);
    const result = await solve(req); expect(result.status, JSON.stringify(result)).toBe('optimal'); expect(result.objectiveEnd).toBe(at(120)); validatePlacements(req, result);
  });
  test('chooses between multiple windows and excludes past time', async () => {
    const draft = event('a', 30); draft.windows = [{ start: at(-60), end: at(-15) }, { start: at(60), end: at(90) }, { start: at(0), end: at(30) }];
    const req = request([draft]); req.now = at(-10);
    const result = await solve(req); expect(result.status, JSON.stringify(result)).toBe('optimal'); expect(result.placements[0].start).toBe(at(0));
  });
  test('cannot silently omit drafts in an infeasible batch', async () => {
    const result = await solve(request([event('a', 60, ['attention'], 0, 60), event('b', 60, ['attention'], 0, 60)]));
    expect(result.status, JSON.stringify(result)).toBe('infeasible'); expect(result.placements).toEqual([]);
  });
  test('draft-specific exception preserves other overlapping commitments', async () => {
    const req = request([event('fair', 30, ['attention'], 0, 60), event('homework', 30, ['attention'], 0, 90)], [busy('class', 0, 60), busy('meeting', 0, 15)]);
    req.exceptions = [{ id: 'exception', eventKey: 'primary/class', eventStart: at(0), eventEnd: at(60), draftIds: ['fair'], start: at(0), end: at(60) }];
    const result = await solve(req); expect(result.status).toBe('optimal');
    expect(result.placements.find(p => p.draftId === 'fair')!.start).toBe(at(15));
    expect(result.placements.find(p => p.draftId === 'homework')!.start).toBe(at(60)); validatePlacements(req, result);
  });
  test('moved occurrences invalidate their old exceptions', async () => {
    const req = request([event('a', 30, ['attention'], 0, 60)], [busy('class', 0, 60)]);
    req.exceptions = [{ id: 'old', eventKey: 'primary/class', eventStart: at(-30), eventEnd: at(60), draftIds: ['a'], start: at(0), end: at(60) }];
    expect((await solve(req)).status).toBe('infeasible');
  });
  test('handles sub-minute commitments without rounding a collision away', async () => {
    const blocker = busy('meeting', 30, 45); blocker.start = new Date(Date.parse(at(30)) - 1000).toISOString();
    const result = await solve(request([event('a', 30)], [blocker]));
    expect(result.placements[0].start).toBe(at(45));
  });
  test('rejects invalid durations and missing windows', async () => {
    expect((await solve(request([event('a', 0)]))).status).toBe('error');
    const a = event('a'); a.windows = [];
    expect((await solve(request([a]))).status).toBe('error');
  });
  test('matches independently enumerated optimum for small resource problems', async () => {
    for (let seed = 0; seed < 8; seed++) {
      const events = [event('a', 10, seed % 2 ? ['x', 'y'] : ['x'], 0, 40), event('b', 15, ['x'], seed % 3 * 5, 45), event('c', 10, ['y'], 0, 40)];
      let best = Infinity;
      for (let a = 0; a <= 30; a += 5) for (let b = seed % 3 * 5; b <= 30; b += 5) for (let c = 0; c <= 30; c += 5) {
        const starts = [a, b, c];
        let valid = true;
        for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) if (events[i].resourceIds.some(r => events[j].resourceIds.includes(r)) && starts[i] < starts[j] + events[j].durationMinutes && starts[j] < starts[i] + events[i].durationMinutes) valid = false;
        if (valid) best = Math.min(best, Math.max(...events.map((e, i) => starts[i] + e.durationMinutes)));
      }
      const req = request(events), result = await solve(req);
      expect(result.objectiveEnd).toBe(at(best)); validatePlacements(req, result);
    }
  });
  test('no solution before the search limit is a timeout, not infeasibility', async () => {
    const req = request([event('a'), event('b')]); req.timeLimitSeconds = 1e-9;
    const result = await solve(req); expect(result.status, JSON.stringify(result)).toBe('timeout');
  });
});
