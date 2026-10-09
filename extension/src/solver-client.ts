import type { SolverRequest, SolverResult } from './types';
export function startSolver(request: SolverRequest): { result: Promise<SolverResult>; cancel: () => void } {
  const worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
  let finish: (r: SolverResult) => void;
  const result = new Promise<SolverResult>(resolve => { finish = resolve; });
  let ended = false;
  const complete = (r: SolverResult) => { if (ended) return; ended = true; clearTimeout(timer); worker.terminate(); finish(r); };
  // Allow cold WASM initialization in addition to the solver's ten-second search limit.
  const timer = setTimeout(() => complete({ status: 'timeout', placements: [], diagnostics: ['Solver worker did not finish. Try again.'] }), 30_000);
  worker.onmessage = event => complete(event.data as SolverResult);
  worker.onerror = event => complete({ status: 'error', placements: [], diagnostics: [event.message] });
  worker.postMessage(request);
  return { result, cancel: () => complete({ status: 'cancelled', placements: [], diagnostics: ['Scheduling cancelled.'] }) };
}
