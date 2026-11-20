-- timeTable plan 8: manual edits make a solution's stored violation report stale until re-checked.
ALTER TABLE tt_solutions ADD COLUMN report_stale boolean NOT NULL DEFAULT false;
