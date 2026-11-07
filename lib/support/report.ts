import "server-only";
import { and, count, eq, gte } from "drizzle-orm";
import { withSchool } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";
import { getSchoolById } from "@/lib/db/schools";
import { createSupportIssue } from "./github";

export const SUPPORT_KINDS = ["bug", "question", "idea"] as const;
export type SupportKind = (typeof SUPPORT_KINDS)[number];

/** Per-staff reports per rolling 24 h; stops a stuck form or abuse from flooding the inbox. */
export const SUPPORT_DAILY_LIMIT = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
const TITLE_CHARS = 70;

const KIND_TITLES: Record<SupportKind, string> = { bug: "תקלה", question: "שאלה", idea: "הצעה" };

export interface SupportReporter {
  id: string;
  schoolId: string;
  fullName: string;
  email: string;
  role: string;
}

export interface SupportReportInput {
  kind: SupportKind;
  message: string;
  page?: string;
  userAgent?: string;
}

/** Counts and records the report in audit_log; false when the reporter is over the limit. */
async function consumeSupportQuota(reporter: SupportReporter, kind: SupportKind, now: Date): Promise<boolean> {
  return withSchool(reporter.schoolId, async (tx) => {
    const [{ used }] = await tx
      .select({ used: count() })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.schoolId, reporter.schoolId),
          eq(auditLog.actorStaffId, reporter.id),
          eq(auditLog.action, "support_report"),
          gte(auditLog.at, new Date(now.getTime() - DAY_MS)),
        ),
      );
    if (used >= SUPPORT_DAILY_LIMIT) return false;
    await tx.insert(auditLog).values({
      schoolId: reporter.schoolId,
      actorStaffId: reporter.id,
      action: "support_report",
      targetTable: "support_reports",
      payload: { kind },
      at: now,
    });
    return true;
  });
}

/**
 * Staff-written text must not notify GitHub users ("@name") or break the
 * metadata table ("|"); a zero-width space after "@" defuses mentions.
 */
export function neutralize(text: string): string {
  return text.replace(/@/g, "@​").replace(/\|/g, "\\|");
}

export function buildSupportIssue(reporter: SupportReporter, schoolName: string, input: SupportReportInput) {
  const message = neutralize(input.message.trim());
  const firstLine = message.split("\n")[0].slice(0, TITLE_CHARS);
  return {
    title: `[${neutralize(schoolName)}] ${KIND_TITLES[input.kind]}: ${firstLine}`,
    labels: [input.kind],
    body: [
      message,
      "",
      "---",
      `| | |`,
      `|---|---|`,
      `| בית ספר | ${neutralize(schoolName)} |`,
      `| מדווח/ת | ${neutralize(reporter.fullName)} (${reporter.role}) |`,
      `| אימייל | ${neutralize(reporter.email)} |`,
      `| עמוד | ${neutralize(input.page ?? "-")} |`,
      `| דפדפן | ${neutralize(input.userAgent ?? "-")} |`,
    ].join("\n"),
  };
}

export type SupportResult = { status: "sent"; issue: number } | { status: "rate_limited" };

export async function sendSupportReport(
  reporter: SupportReporter,
  input: SupportReportInput,
  now: Date = new Date(),
): Promise<SupportResult> {
  if (!(await consumeSupportQuota(reporter, input.kind, now))) return { status: "rate_limited" };
  const school = await getSchoolById(reporter.schoolId);
  const issue = await createSupportIssue(buildSupportIssue(reporter, school?.name ?? reporter.schoolId, input));
  return { status: "sent", issue };
}
