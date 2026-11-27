import { NextResponse } from "next/server";

const STATUS = {
  duplicate_name: 409,
  room_in_use: 409,
  period_in_use: 409,
  slot_taken: 409,
  not_in_week: 400,
  invalid_staff: 400,
  period_over: 422,
  out_of_range: 422,
  no_active_year: 422,
  no_week: 422,
  not_yours: 403,
} as const;

export type RoomsErrorCode = keyof typeof STATUS;

/** A rule the rooms domain refused; routes map it to `{ error: code }` with its status. */
export class RoomsError extends Error {
  constructor(readonly code: RoomsErrorCode) {
    super(code);
    this.name = "RoomsError";
  }
}

export function roomsErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof RoomsError)) return null;
  return NextResponse.json({ error: error.code }, { status: STATUS[error.code] });
}

/** Runs a route body, turning a RoomsError into its response; anything else is rethrown. */
export async function withRoomsErrors(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e) {
    const response = roomsErrorResponse(e);
    if (response) return response;
    throw e;
  }
}

/** True for a Postgres unique violation (Drizzle may wrap it in `cause`). */
export function isUniqueViolation(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current && depth < 4; depth++) {
    if ((current as { code?: string }).code === "23505") return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}
