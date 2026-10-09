import { afterEach, expect, test, vi } from 'vitest';
import { startSolver } from '../src/solver-client';
import { event, request } from './helpers';
class WorkerStub {
  static instances: WorkerStub[] = [];
  onmessage?: (event: { data: unknown }) => void;
  onerror?: (event: { message: string }) => void;
  terminated = false;
  postMessage = vi.fn();
  constructor() { WorkerStub.instances.push(this); }
  terminate() { this.terminated = true; }
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); WorkerStub.instances = []; });
test('cancelling resolves distinctly and terminates the dedicated worker', async () => {
  vi.stubGlobal('Worker', WorkerStub); const job = startSolver(request([event('a')])); job.cancel();
  expect((await job.result).status).toBe('cancelled'); expect(WorkerStub.instances[0].terminated).toBe(true);
});
test('worker failure and initialization timeout cannot be mistaken for infeasibility', async () => {
  vi.useFakeTimers(); vi.stubGlobal('Worker', WorkerStub);
  const failed = startSolver(request([event('a')])); WorkerStub.instances[0].onerror!({ message: 'WASM unavailable' });
  expect((await failed.result).status).toBe('error');
  const stuck = startSolver(request([event('b')])); await vi.advanceTimersByTimeAsync(30_000);
  expect((await stuck.result).status).toBe('timeout'); expect(WorkerStub.instances[1].terminated).toBe(true);
});
