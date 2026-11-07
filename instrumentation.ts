import type { Instrumentation } from "next";

/**
 * Error monitoring without a vendor: unexpected server errors are filed as
 * deduplicated issues in the private support repo (lib/support/error-report.ts).
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  // Positive check: Next inlines NEXT_RUNTIME per bundle, so the edge build drops
  // this branch and never traces the Node-only imports (pg, dotenv) behind it.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { reportServerError } = await import("@/lib/support/error-report");
    await reportServerError(error, {
      method: request.method,
      path: request.path,
      routePath: context.routePath,
      routeType: context.routeType,
    });
  }
};
