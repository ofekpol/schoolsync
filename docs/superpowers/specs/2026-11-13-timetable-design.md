# timeTable, service selection and profile categories: design

Date: 2026-11-13. Status: awaiting approval. No code has been written.

## Intent

Schools go back to an external vendor every time their weekly timetable changes. timeTable lets
the school build and change it alone: the principal enters the data, teachers enter their
constraints, the system proposes timetables, the principal picks and adjusts one.
It is the second EduSolutions product, sold as a premium add-on, living inside the SchoolSync
site with the same login and school accounts.

Vocabulary: **grade** = ז, ח, ט; **class** = ז1, ז2; **Plata** = several classes of one grade
having the same lesson at the same period (a class is in or out of the Plata).

## Goals, non-goals, anti-goals

Goals
- A school can have the Gantt, timeTable or both, chosen by platform admins.
- The principal defines profile categories; staff fill them in; the principal can act on a label.
- A timetable for 200-250 teachers is generated in minutes, as three options, each listing what
  it satisfies and breaks. The principal can move lessons by hand and regenerate.
- New constraint types are cheap to add.

Non-goals (MVP): rooms, parents and students, email, imports, the public demo, teachers working
at two schools, grades outside ז-יב.

Anti-goals
- Any change in how the Gantt behaves for an existing school, user or URL.
- A profile label that grants access. Labels describe people; roles and scopes decide access.
- A second place where constraint rules are written (see Solver).

## Approaches considered

Solver
- **Chosen: one Python solver on Google OR-Tools (CP-SAT), tested on two hosts.** Strongest
  option at this size; the hosting comparison costs no duplicate code.
- Rejected: a hand-written TypeScript solver inside the app. No new language, but weak at 250
  teachers and the riskiest part to maintain.

Profile categories
- **Chosen: labels next to the existing roles and editor scopes.** The Gantt is untouched.
- Rejected: categories replace roles and scopes. Rewrites Gantt access control and forces a
  migration of every current Kfar Galim user.

## Three projects, in order

| # | Project | Size | Depends on |
|---|---------|------|-----------|
| 0 | Solver spike (throwaway) | days | Kfar Galim's real timetable data |
| 1 | Service selection | small | - |
| 2 | Profile categories | medium | - |
| 3 | timeTable MVP | large | 0, 1, 2 |

Each gets its own branch from `staging`, its own plan and its own release.

## Folder structure

```
app/(timetable)/timetable/        timeTable pages (own layout + service guard)
app/api/v1/timetable/             timeTable API
app/api/v1/admin/categories/      profile categories API
app/(staff)/profile/              a staff member's own profile labels
lib/services.ts                   shared: which services a school has
lib/profile/                      shared: categories, options, staff labels
lib/timetable/                    boards, data entry, constraints/, solver-client, clash checks
lib/db/schema-profile.ts          new tables (schema.ts is near the 400-line limit)
lib/db/schema-timetable.ts
components/profile/  components/timetable/
solver/                           Python: model, one encoder per constraint type, pytest
test/{unit,integration,e2e}/timetable/  and  .../profile/
messages/he.json, en.json         new `profile.*` and `timetable.*` namespaces
```

## Shared code that changes

All additive. Each item is the whole change to existing code.

| Existing code | Change |
|---|---|
| `schools` (migration) | `services text[] not null default '{gantt}'`, checked against `gantt`, `timetable` |
| `staff_users` (migration) | `profile_completed_at timestamptz null` |
| `lib/db/client.ts`, drizzle config | load the two new schema files |
| `lib/db/provision.ts`, `lib/validations/school.ts`, `/platform/schools` | services + week structure at onboarding and later |
| `lib/nav.ts` | links per service; "timeTable", "Categories" |
| `(staff)` and `(admin)` layouts | redirect to `/profile` when the school has categories and the user has not filled them |
| `app/(staff)/dashboard/page.tsx` | a school without `gantt` is redirected to `/timetable` (one redirect instead of editing ten `/dashboard` links) |
| Public token pages (`lib/db/schools.ts` lookup) | not-found for a school without `gantt` |
| `/admin/staff` | label columns and a label filter |
| `lib/auth/public-request.ts` | add `/timetable` to the reserved prefixes (otherwise it matches the public viewer pattern and skips the auth gate) |
| `(staff)` and `(admin)` layouts | their duplicated header and guards move into one shared `StaffShell`, which the timeTable layout also uses |

A timeTable-only school's staff sign-up link (`/auth/login?school=<token>`) keeps working; only
the public Gantt views are closed.

Plans: `docs/superpowers/plans/2026-11-13-timetable-00-split.md`.

Known shortcut: Gantt **API** routes are not service-guarded for a timeTable-only school. Staff
there can only reach their own school's (empty) Gantt data. Guard them when a school is ever
downgraded from the Gantt.

## Project 1: service selection

- `schools.services` as above; existing schools get `{gantt}` from the default.
- `lib/services.ts`: `hasService(school, name)`; read through `lib/db/schools.ts`, outside `withSchool`.
- Platform admins tick services when creating a school and can change them on `/platform/schools`.
  Switching a service off hides it; its data stays.
- timeTable pages and every timeTable API route check `hasService(..., 'timetable')` (404 / 403).
- Tests: provisioning with each combination; a Gantt-only school gets 404 on `/timetable`;
  existing e2e suite passes unchanged.

## Project 2: profile categories

Tables (all with `school_id` + the standard RLS policy)
```
profile_categories        id, school_id, name, multi_select, required, sort_order, archived_at
profile_category_options  id, school_id, category_id, label, sort_order, archived_at
staff_profile_options     staff_user_id, option_id, school_id      PK (staff_user_id, option_id)
```

Behavior
- Principal (`admin`) manages categories and options on `/admin/categories`: add, rename,
  reorder, archive. Archiving keeps history; nothing is hard-deleted.
- A staff member with `profile_completed_at` null, in a school that has at least one category,
  is sent to `/profile` after login and picks their options. Until the principal creates a
  category, nobody is asked anything, so Kfar Galim sees no change on release.
- Staff can edit their own labels later; the principal can edit anyone's.
- `/admin/staff` shows labels and filters by one. Group actions in this project: see the list.
  timeTable adds "aim a constraint at this label". "Create a Gantt event for this group" is later.
- Demo schools: skipped.
- Tests: RLS positive + cross-school denial for the three tables; a label never changes what a
  user may edit in the Gantt.

## Project 3: timeTable MVP

### Roles
- `admin` = principal: everything.
- Any staff user linked to a teacher record: own constraints before the deadline, own timetable
  after publishing.
- Everyone else: no access.

### Data model (prefix `tt_`, all with `school_id` + RLS)
```
tt_school_settings  school_id PK, week jsonb            default week, set by platform admins
tt_boards           id, academic_year_id, name, status, week jsonb (copied from settings),
                    teacher_deadline, published_solution_id
                    status: setup -> collecting -> review -> published
tt_classes          id, board_id, grade, number           unique (board_id, grade, number) = ז1
tt_subjects         id, board_id, name
tt_teachers         id, board_id, full_name, staff_user_id null, free_day_entitled, external_ref null
tt_lesson_blocks    id, board_id, subject_id, weekly_periods, external_ref null
tt_block_classes    block_id, class_id
tt_block_teachers   block_id, teacher_id
tt_constraints      id, board_id, type, hardness (hard|soft), weight, params jsonb,
                    source (teacher|management), teacher_id null, created_by
tt_runs             id, board_id, status (queued|running|done|failed), error, requested_by, timestamps
tt_solutions        id, run_id, board_id, profile, score, violations jsonb
tt_placements       solution_id, block_id, day, period, pinned     PK (solution_id, block_id, day, period)
```

- `week` JSON: list of days, each with its periods and times. Validated by Zod. Small and always
  read whole, so not normalized.
- A **lesson block** is the unit that gets placed: one subject, N weekly periods, a set of
  classes and a set of teachers, all busy together. An ordinary lesson is a block with one class
  and one teacher. A Plata is a block with several of each; classes outside the Plata get their
  own blocks.
- A teacher record exists before the person has a login. `staff_user_id` is set by the principal
  ("add from staff", filterable by profile label), never by matching emails.
- `external_ref` columns and bulk endpoints are the hook for imports later.

### Constraints
- One row per constraint; the meaning lives in a **type**. A type is: a Zod schema for `params`
  and a small form (TypeScript, `lib/timetable/constraints/<type>.ts`), plus one encoder function
  (Python, `solver/constraints/<type>.py`). Adding a type touches those two files only.
- Teachers enter hard constraints only (MVP: free day, if entitled). Management enters hard and
  soft ones, aimed at a teacher, a class, a grade, a subject or a profile label.
- MVP types: `teacher_free_day`, `teacher_unavailable`, `label_common_free_periods` (for example
  all math teachers share one free period), `subject_max_per_day`, `class_no_gaps`,
  `teacher_few_gaps` (soft). More are added while testing with Kfar Galim.
- A label-aimed constraint covers only teachers linked to a staff user who holds that label; the
  constraint form shows how many teachers it reaches and lists unlinked ones.
- Always enforced, not configurable: a teacher or a class is never in two places at once.

### Solver
- Stateless: JSON in (week, classes, teachers, blocks, constraints, pinned placements, weight
  profile), JSON out (placements, violations). The app stores the input in `tt_runs` and the
  output in `tt_solutions` / `tt_placements`; the browser polls the run.
- User "hard" constraints are modeled with a very large penalty, so a result always comes back
  and reports exactly what it had to break.
- Three options = three weight profiles (teachers first, classes first, balanced), run in parallel.
- The same service has an `evaluate` mode: fixed placements in, violations out. It is the only
  place constraint rules exist. The app itself checks only double-bookings, for instant feedback
  while dragging.
- Regenerate keeps pinned placements. The same mechanism serves mid-year changes later.
- **Spike (project 0)** answers, on Kfar Galim's real data: does a full solve finish inside a
  Vercel Python function's time and size limits on the paid plan? Yes: host it there. No: same
  code in a small container. The spike is throwaway and decides only hosting.

### Screens
Principal, under `/timetable/[board]/`
1. **Setup** tabs: Classes, Subjects, Teachers, Lessons, Plata, Constraints. Built for 250
   teachers: spreadsheet-like tables, paste a column of names, keyboard navigation, "add from
   staff by label". Lessons is a class x subject grid: hours and teacher per cell.
2. **Collect**: set the deadline, copy the link for teachers, see who has answered, fill in for
   someone who has not. After the deadline, missing teachers count as unconstrained.
3. **Generate**: start a run, progress, then three options side by side with score and the list
   of broken constraints.
4. **Edit**: the chosen option as a grid by class or by teacher. Drag a lesson, see clashes at
   once and the full constraint report after `evaluate`. Pin lessons, regenerate the rest.
5. **Publish**: teachers can now see it. Printable (A4, monochrome-legible).

Teacher, `/timetable/me`: before the deadline, own constraints; after publishing, own weekly
timetable, printable.

Platform, `/platform/schools`: services and the school's default week.

### Build order inside the MVP
3a setup data, 3b teacher constraints and deadline, 3c generate and compare, 3d edit, publish
and teacher view. Each is shippable to staging on its own.

### Testing
Project conventions apply: Zod at every API boundary, `withSchool` everywhere, RLS positive and
cross-school denial for every new table, 80% coverage on new code, pytest for the solver with one
test per constraint type, one e2e for the principal flow and one for the teacher flow.

## Later phases (designed for, not built)

- **Teacher approval rounds**: `tt_solution_reviews (solution_id, teacher_id, round, status
  approved|change_requested, note)`; a change request becomes a constraint and a regenerate.
- **Mid-year changes**: copy the published solution, pin everything, edit the data (a teacher
  leaves, hours change), regenerate with an added objective "move as few lessons as possible";
  solutions get an `effective_from` date.
- **Imports**: Excel or other systems feed the same bulk endpoints, matched by `external_ref`.
- **Group actions in the Gantt**, email reminders, rooms, parents' view.

## Calls I made (correct any)

- Week structure is JSON, not tables.
- Classes, subjects and teachers belong to a board (a school year), not to the school; "copy
  from last year" comes with the second year.
- Profile categories are free labels and are not linked to `tt_classes` / `tt_subjects`.
- No starter categories are seeded; the principal creates them.
- The profile step runs after an admin activates the account, not during sign-up.
- Gantt API routes are not service-guarded (shortcut above).

## Left to the builder

Exact UI layout, table indexes, polling interval, the solver's weight values, and how the
solver is packaged for whichever host the spike picks.

## Risks

- Vercel Python limits are unverified; that is what the spike is for.
- Solve time at 250 teachers is unproven until run on real data.
- Vercel Hobby is non-commercial; a paid add-on needs the upgrade in `docs/COST_PLAN.md`.
- Kfar Galim's data is production data: it must be supplied as a file by the school, never read
  from the production database into a transcript.

## Addendum, 2026-11-14: demo first, no real data file

Where this section disagrees with the text above, this section wins.

**Decision (Ofek).** Kfar Galim's real timetable file will not arrive. Kfar Galim is mid-year
and wants to redo its timetable next year, and other schools need to see the product. So the
next goal is a demo of the full principal flow (setup, constraints, three generated options,
edit by hand, publish) that shows a timetable built from generated constraints.

**Demo data.** The staging database's `kfar-galim` school: its staff users and their profile
labels. Classes, subjects, lessons, Plata and constraints are produced by a seeded script
(`pnpm seed:timetable-demo`), written into one board named `הדגמה`. Production is still never
read. Facts found on staging on 2026-11-14:
- Staging is a copy of production, so the staff names are real. The seed uses them by default
  and has `--anonymize` (names become "מורה 1", "מורה 2") for showing to other schools.
- 34 active staff, no active profile category yet, no class list anywhere. The class count per
  grade is a constant in the seed (4 per grade until Ofek supplies the real numbers), and the
  seed adds placeholder teachers without a login when the staff cannot cover the week.
- A staging refresh removes the board; the seed is re-runnable.

**Solver ownership.** Ofek and Claude build the solver in track A. Maor builds the data entry
screens.

**What this changes above**
- "Three projects, in order": project 0 (the spike) is retired. Its two questions (does 250
  teachers solve in minutes; where does the solver run) are answered by the first task of the
  solver plan, on synthetic data, and recorded here.
- "Solver", spike paragraph: no longer "on Kfar Galim's real data", and no longer "on the paid
  plan" as a given. The host is decided by measurement in plan 4.
- "Constraints", MVP types: `meeting` is added (a label or a list of teachers shares N weekly
  periods, optionally consecutive). It is not a solver rule: the export turns it into a lesson
  block with no classes. `label_common_free_periods` waits.
- "Data model": a lesson block may have no classes (a meeting) and has a `consecutive` flag in
  the solver contract. `tt_school_settings` is deferred; a board's week starts from a default
  in code.
- "Build order inside the MVP": setup data, solver, generate and view, constraints, edit and
  publish. The teacher page comes last.
- "Non-goals": "the public demo" still stands. This demo is a board inside a staging school,
  not the public `/demo` sandbox.
- "Risks": "Solve time at 250 teachers is unproven until run on real data" stays true after
  the demo. Synthetic data shows the solver's speed, not that a real school's rules fit the
  lesson-block shape.

Order, owners and what is showable at each stage:
`docs/superpowers/plans/2026-11-13-timetable-00-split.md`.
