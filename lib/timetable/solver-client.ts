import "server-only";
import { SolverOutputSchema, type SolverInput, type SolverOutput } from "@/lib/timetable/solver-contract";

export type SolverCallErrorCode = "solver_not_configured" | "solver_unreachable" | "solver_http_error" | "solver_bad_output";

export class SolverCallError extends Error {
  constructor(
    readonly code: SolverCallErrorCode,
    readonly status?: number,
  ) {
    super(status ? `${code} (${status})` : code);
    this.name = "SolverCallError";
  }
}

const TIMEOUT_MARGIN_SECONDS = 30;

export function solverUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.SOLVER_URL) return env.SOLVER_URL;
  return env.VERCEL_URL ? `https://${env.VERCEL_URL}/api/solve` : null;
}

export async function callSolver(input: SolverInput, env: NodeJS.ProcessEnv = process.env): Promise<SolverOutput> {
  const url = solverUrl(env);
  if (!url) throw new SolverCallError("solver_not_configured");

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (env.SOLVER_TOKEN) headers.Authorization = `Bearer ${env.SOLVER_TOKEN}`;
  if (env.VERCEL_AUTOMATION_BYPASS_SECRET) headers["x-vercel-protection-bypass"] = env.VERCEL_AUTOMATION_BYPASS_SECRET;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(input),
      signal: AbortSignal.timeout((input.timeLimitSeconds + TIMEOUT_MARGIN_SECONDS) * 1000),
    });
  } catch {
    throw new SolverCallError("solver_unreachable");
  }
  if (!response.ok) throw new SolverCallError("solver_http_error", response.status);

  const parsed = SolverOutputSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new SolverCallError("solver_bad_output");
  return parsed.data;
}
