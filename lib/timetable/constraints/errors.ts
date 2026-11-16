export type ConstraintErrorCode =
  | "unknown_id"
  | "not_entitled"
  | "duplicate_free_day"
  | "limit_reached"
  | "deadline_past"
  | "wrong_status";

/** A constraint or collection write the caller can explain to the user. */
export class ConstraintError extends Error {
  constructor(readonly code: ConstraintErrorCode) {
    super(code);
    this.name = "ConstraintError";
  }
}
