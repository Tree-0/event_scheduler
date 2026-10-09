import { solve } from './solver';
import type { SolverRequest } from './types';
self.onmessage = async (event: MessageEvent<SolverRequest>) => self.postMessage(await solve(event.data));
