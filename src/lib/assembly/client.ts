import type { AgentPiece } from '../agentSchema';
import type { SceneSpec } from './dsl';

/** Browser side of /api/assembly. The server holds the key; everything returned is validated again here. */
export class AssemblyApiError extends Error {
  constructor(public code: string, message: string, public status = 0) { super(message); }
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new AssemblyApiError('NETWORK', 'Could not reach the server.');
  }
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) throw new AssemblyApiError(String(json?.code ?? 'HTTP'), String(json?.message ?? `Error ${res.status}`), res.status);
  return json as T;
}

export interface SceneRequest { productName: string; pieces: AgentPiece[]; assumptions?: string[] }
export interface SceneResponse { scene: unknown; warnings: string[]; model: string; latencyMs: number }
export interface CritiqueResponse { verdict: 'ok' | 'revise'; score: number; issues: string[]; scene: unknown; warnings: string[]; model: string; latencyMs: number }

export interface AlignResponse { changes: string[]; scene: unknown; warnings: string[]; model: string; latencyMs: number }

export const requestScene = (req: SceneRequest, signal?: AbortSignal) => post<SceneResponse>('/api/assembly', req, signal);
export const requestCritique = (req: SceneRequest & { scene: SceneSpec; image: string; sanity: string; round: number }, signal?: AbortSignal) =>
  post<CritiqueResponse>('/api/assembly/critique', req, signal);
/** Final verification: the model fixes the problems the deterministic checks still measure. */
export const requestAlign = (req: SceneRequest & { scene: SceneSpec; issues: string[]; sanity: string; image?: string }, signal?: AbortSignal) =>
  post<AlignResponse>('/api/assembly/align', req, signal);
