import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStaffUser } from "@/lib/auth/session";
import { assertAdmin } from "@/lib/auth/admin";
import { listEventTypes } from "@/lib/admin/event-types";
import { createPublishedEvents } from "@/lib/events/crud";
import { parseCalendarImport } from "@/lib/import/calendar-import";
import { invalidatePublicViewerCache } from "@/lib/views/public-viewer-data";

const MAX_CSV_CHARS = 1_000_000;

const ImportRequestSchema = z.object({
  csv: z.string().min(1).max(MAX_CSV_CHARS),
  /** false = preview only; true = publish every row, only when none has an error. */
  commit: z.boolean(),
});

/**
 * Calendar import for a new school's existing year (admin only).
 * Preview first, then commit; a commit is all-or-nothing.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getStaffUser();
  try {
    assertAdmin(user);
  } catch (e) {
    if (e instanceof Response) return NextResponse.json({ error: "Forbidden" }, { status: e.status });
    throw e;
  }
  const parsed = ImportRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation_error" }, { status: 422 });

  const schoolId = user!.schoolId!;
  const result = parseCalendarImport(parsed.data.csv, await listEventTypes(schoolId));
  const rows = result.rows.map(({ line, title, input, error }) => ({
    line,
    title,
    error: error ?? null,
    startAt: input?.startAt ?? null,
    endAt: input?.endAt ?? null,
    allDay: input?.allDay ?? false,
    grades: input?.grades ?? [],
    eventTypeId: input?.eventTypeId ?? null,
  }));
  const hasErrors = result.error !== undefined || result.rows.some((row) => row.error);

  if (!parsed.data.commit || hasErrors || rows.length === 0) {
    return NextResponse.json({ error: result.error ?? null, rows, imported: 0 }, { status: 200 });
  }

  const inputs = result.rows.flatMap((row) => (row.input ? [row.input] : []));
  await createPublishedEvents(schoolId, user!.id, inputs);
  invalidatePublicViewerCache(user!.schoolSlug);
  return NextResponse.json({ error: null, rows, imported: inputs.length }, { status: 201 });
}
