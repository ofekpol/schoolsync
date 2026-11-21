# timeTable setup: class names, subject modes, groups

Approved in chat 2026-11-21.

## Why

Schools teach some subjects in the homeroom class (ז1, ז2...) and others in
groups that mix a grade's classes (math/English levels, majors such as
chemistry). Setup treated every subject the same way and gave groups no names.

## What changes

1. **Classes tab** - each class gets an editable name (default "ז1") and an
   optional type (free text, suggestions: מב"ר, אתגר, מופת).
2. **Subjects tab** - add a single subject; per subject, pick the grades where
   it is taught in groups ("group grades"). Default: none = homeroom everywhere.
3. **Teachers tab** - the free-day column is gone (everyone stays entitled, the
   DB default); filter teachers by a profile option (as in "add from staff").
4. **Lessons tab** - two sub-views:
   - *Homeroom classes*: the current grid, rows = subjects that are homeroom in
     the grade, plus any subject that already has a lesson/cluster touching the
     grade (so a class left out of a cluster gets its own cell = the exception).
     Columns fit the width (no horizontal scroll).
   - *Groups and majors* (replaces the Plata tab): a cluster = one block with
     2+ classes of one grade, taught at the same time; each teacher in it is a
     named group ("רמה 1"). Picking a subject auto-checks teachers whose profile
     has an option named like the subject.

## Data (migration 0028)

- `tt_classes.name`, `tt_classes.kind` (nullable text).
- `tt_subjects.group_grades int[]` default `{}`.
- `tt_block_teachers.group_name` (nullable text).

No new tables, so RLS is unchanged. The solver input is unchanged: a cluster is
still one block with several teachers.

## Approaches considered

- **Cluster = existing multi-class block + group names (picked)**: tiny schema
  change, solver untouched. Groups in a grade are always simultaneous (user
  confirmed).
- Independent groups with student rosters: needed only if groups are scheduled
  apart; much larger (solver, rosters). Rejected.
- Teacher-subject table: rejected for now; profile options already say what a
  teacher teaches.

## Builder's calls

- Class type is free text, display only.
- Subject auto-match is exact name match (trimmed) against profile option labels.
- A grouped subject that is not grouped in the edited block's grade still shows
  when editing that block, so old data stays editable.
