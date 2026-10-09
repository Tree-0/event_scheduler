import { CpModel, CpSolver, setCloudNoticeEnabled, type BoolVar, type IntVar, type IntervalVar } from 'or-tools-wasm/cp-sat';
import { usableWindows, validateRequest } from './constraints';
import { instant, iso } from './time';
import { MINUTE, type SolverRequest, type SolverResult } from './types';

export const OBJECTIVES = [{ id: 'makespan', label: 'Makespan — finish the last event earliest' }];
setCloudNoticeEnabled(false);
export async function solve(request: SolverRequest): Promise<SolverResult> {
  try {
    validateRequest(request);
    const domains = request.events.map(event => usableWindows(event, request).map(w => ({
      lo: Math.ceil(instant(w.start) / (5 * MINUTE)),
      hi: Math.floor((instant(w.end) - event.durationMinutes * MINUTE) / (5 * MINUTE)),
    })).filter(w => w.hi >= w.lo));
    const missing = domains.findIndex(d => !d.length);
    if (missing >= 0) return { status: 'infeasible', placements: [], diagnostics: [`${request.events[missing].title}: no available window fits its duration on the five-minute start grid.`] };
    const origin = Math.min(...domains.flat().map(w => w.lo));
    const bound = (Math.max(...domains.flat().map(w => w.hi)) - origin) * 5 + Math.max(...request.events.map(e => e.durationMinutes));
    const model = new CpModel();
    const last = model.newIntVar(0, bound, 'last_completion');
    const resourceIntervals = new Map<string, IntervalVar[]>();
    const choices: { present: BoolVar; tick: IntVar }[][] = [];
    request.events.forEach((event, i) => {
      const options = domains[i].map((domain, j) => {
        // Upstream 1.0 rejects integer interval variables with a 0/1 domain as
        // Boolean expressions. Shift the index domain; actual times stay unchanged.
        const tick = model.newIntVar(domain.lo - origin + 2, domain.hi - origin + 2, `start_${i}_${j}`);
        const start = tick.minus(2).times(5);
        const present = model.newBoolVar(`chosen_${i}_${j}`);
        const interval = model.newOptionalFixedSizeIntervalVar(start, event.durationMinutes, present, `event_${i}_${j}`);
        model.add(last.ge(start.plus(event.durationMinutes))).onlyEnforceIf(present);
        for (const id of new Set(event.resourceIds)) resourceIntervals.set(id, [...(resourceIntervals.get(id) ?? []), interval]);
        return { present, tick };
      });
      model.addExactlyOne(options.map(o => o.present));
      choices.push(options);
    });
    for (const intervals of resourceIntervals.values()) model.addNoOverlap(intervals);
    model.minimize(last);
    const solver = new CpSolver();
    // Direct execution stays inside our dedicated worker; never use package cloud fallback.
    const raw = await solver.solve(model, { executor: 'direct', maxTimeInSeconds: Math.min(10, request.timeLimitSeconds ?? 10), randomSeed: 0 });
    // Proto3 omits the zero-valued UNKNOWN status in the package's decoded response.
    const name = raw == null || raw === 0 ? 'unknown' : solver.statusName(raw).toLowerCase();
    if (name !== 'optimal' && name !== 'feasible') return { status: name === 'infeasible' ? 'infeasible' : name === 'unknown' ? 'timeout' : 'error', placements: [], diagnostics: [`Solver: ${name}.`] };
    const placements = request.events.map((event, i) => {
      const option = choices[i].find(o => solver.booleanValue(o.present))!;
      const start = (origin + Number(solver.value(option.tick)) - 2) * 5 * MINUTE;
      return { draftId: event.id, start: iso(start), end: iso(start + event.durationMinutes * MINUTE) };
    }).sort((a, b) => a.start.localeCompare(b.start) || a.draftId.localeCompare(b.draftId));
    return { status: name, placements, objectiveEnd: iso((origin * 5 + Number(solver.value(last))) * MINUTE), diagnostics: [] };
  } catch (error) { return { status: 'error', placements: [], diagnostics: [error instanceof Error ? error.message : String(error)] }; }
}
