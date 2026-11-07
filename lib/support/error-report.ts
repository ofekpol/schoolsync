import "server-only";
import { createHash } from "node:crypto";
import { createSupportIssue, findOpenIssueWithText, isSupportEnabled } from "./github";
import { neutralize } from "./report";

/** Per server instance: stops an error storm from opening hundreds of issues. */
const MAX_REPORTS_PER_INSTANCE = 10;
const STACK_LINES = 15;
const reported = new Set<string>();

export interface ServerErrorContext {
  method: string;
  path: string;
  routePath: string;
  routeType: string;
}

/** School link tokens are 64 hex chars and must never land in an issue; queries are dropped too. */
export function redactPath(path: string): string {
  return path.split("?")[0].replace(/[0-9a-f]{64}/gi, "<token>");
}

export function errorFingerprint(error: Error, routePath: string): string {
  return createHash("sha256").update(`${routePath}\n${error.name}\n${error.message.slice(0, 200)}`).digest("hex").slice(0, 12);
}

export function buildErrorIssue(error: Error, context: ServerErrorContext, fingerprint: string) {
  const stack = (error.stack ?? "").split("\n").slice(0, STACK_LINES).join("\n");
  const message = neutralize(redactPath(error.message));
  return {
    title: `[error] ${context.routePath}: ${message.slice(0, 80)}`,
    labels: ["error"],
    body: [
      `**${neutralize(error.name)}**: ${message}`,
      "",
      `| | |`,
      `|---|---|`,
      `| route | \`${context.routePath}\` (${context.routeType}) |`,
      `| request | ${context.method} \`${redactPath(context.path)}\` |`,
      `| fingerprint | \`fp:${fingerprint}\` |`,
      "",
      "```",
      redactPath(stack), // mentions are inert inside a code block
      "```",
      "",
      "Repeats of this error are not filed while this issue is open. Close it once fixed.",
    ].join("\n"),
  };
}

/**
 * Files an unexpected server error as an issue in the private support repo,
 * once per fingerprint while that issue is open. Never throws.
 */
export async function reportServerError(error: unknown, context: ServerErrorContext): Promise<void> {
  if (!isSupportEnabled() || !(error instanceof Error)) return;
  const fingerprint = errorFingerprint(error, context.routePath);
  if (reported.has(fingerprint) || reported.size >= MAX_REPORTS_PER_INSTANCE) return;
  reported.add(fingerprint);
  try {
    if (await findOpenIssueWithText(`fp:${fingerprint}`)) return;
    await createSupportIssue(buildErrorIssue(error, context, fingerprint));
  } catch (reportError) {
    console.error("[error-report] could not file issue", reportError instanceof Error ? reportError.message : reportError);
  }
}
