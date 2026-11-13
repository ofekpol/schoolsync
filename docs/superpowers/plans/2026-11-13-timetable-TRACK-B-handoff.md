# timeTable: Track B handoff (for Maor)

You are taking Track B. Ofek has Track A. This page is everything you need to start without
having seen the planning conversation.

## What we are building, in five lines

- **timeTable**: a second EduSolutions product inside the SchoolSync site. A school builds its
  weekly timetable itself: the principal enters teachers, classes and lessons, teachers enter
  their constraints, the system generates three timetables, the principal picks and adjusts one.
- **Service selection**: each school has the Gantt, timeTable or both. Platform admins choose.
- **Profile categories**: the principal defines categories and options (subject, grade, role);
  staff pick theirs after login; the principal filters staff by label. Labels never grant access.
- The Gantt must keep working exactly as it does today.
- Pilot school: Kfar Galim.

## Read these, in this order

1. `CLAUDE.md` (repo root): project rules. They apply to every line you write.
2. `docs/superpowers/specs/2026-11-13-timetable-design.md`: the full design. Read all of it.
3. `docs/superpowers/plans/2026-11-13-timetable-00-split.md`: who does what, and the rules
   that keep our branches from colliding.
4. Your plans, below.

## Your plans

| # | Plan | File | Start |
|---|------|------|-------|
| 2 | Profile categories | `2026-11-13-timetable-02-profile-categories.md` | now |
| 3 | Solver spike (throwaway) | `2026-11-13-timetable-03-solver-spike.md` | when the data file arrives |
| 4 | Solver contract + service | outline in `00-split.md` | after plan 3 |
| 7 | Generate + compare options | outline in `00-split.md` | after plans 4 and 5 |

Plans 4 and 7 are outlines. Write the detailed plan for each when it is unblocked (in Claude
Code: "use superpowers:writing-plans to detail plan 4 from the split document and the spec").

Ofek's plans, for reference only: 1 (service selection), 5 (setup data), 6 (teacher
constraints), 8 (edit and publish).

## Words we agreed on

- **Grade** = ז, ח, ט ... **Class** = ז1, ז2, ז3 ...
- **Plata** = several classes of one grade having the same lesson at the same period. A class
  is "in the Plata" or "out of the Plata".
- **Lesson block** = the unit the solver places: one subject, weekly periods, a set of classes
  and a set of teachers who are all busy together. An ordinary lesson has one class and one
  teacher; a Plata has several.
- Product name and URL: **timeTable**, `/timetable`. (`/schedule` is the Gantt's guest view.)

## Decisions already made (do not reopen without talking to Ofek)

- School `admin` = the principal. Teachers are regular staff users, one school per account.
- Platform admins (us) choose a school's services and its week structure (days, periods, times).
- No rooms, no parents, no email, no imports, not in the public demo, grades ז to יב only.
- The only constraint every school has is a teacher's **free day**. Others are added as
  constraint types while testing with Kfar Galim.
- Teachers enter only binding constraints. Soft preferences are entered by management only.
- Teachers who miss the deadline count as having no constraints.
- The solver always returns a result and lists what it had to break. Three options = three
  priority settings (teachers first, classes first, balanced).
- The principal can move lessons by hand and regenerate; pinned lessons stay put.
- Solver: Python with Google OR-Tools (CP-SAT). The spike decides whether it runs as a Vercel
  Python function or in a small container. Constraint rules exist only in the solver.
- Profile categories are free labels next to the existing roles and editor scopes. They are not
  linked to the timetable's classes and subjects.

## Rules for working in parallel

- Branch from `staging`: `feature/profile-categories`, `spike/timetable-solver`,
  `feature/timetable-solver`, `feature/timetable-generate`.
- **Your migration numbers: 0022 (plan 2) and 0025 (plan 7).** Ofek has 0021, 0023, 0024.
- **Plan 2, Task 5 waits for Ofek's plan 1 to be merged into `staging`.** Tasks 1 to 4 do not.
  Plan 1 creates `components/staff/StaffShell.tsx` and changes `lib/nav.ts`; Task 5 builds on both.
- **Plan 4 starts with the solver's JSON contract** (`lib/timetable/solver-contract.ts` and
  `solver/fixtures/tiny.json`), as its own small PR that Ofek reviews. Ofek's setup screens
  export to that contract, so agree on it before building the solver around it.
- Your files: `lib/profile/`, `components/profile/`, `lib/db/schema-profile.ts`, `solver/`,
  `spikes/`. Ofek's: `lib/timetable/` (except the contract and `solver-client.ts`),
  `components/timetable/`, `lib/db/schema-timetable.ts` until plan 5 is merged.
- Message keys you own: `nav.categories`, `profile.*`, `admin.categories.*`, `admin.staff.labels.*`.
- Merge with a merge commit, only when every check on the PR is green and `pnpm build` passes.
  Never commit to `main`. No worktrees.

## What you need from Ofek

- **Kfar Galim's current timetable and teacher list, as a file.** The spike cannot start
  without it. Keep it in `spikes/timetable-solver/data/` (gitignored). Never commit it, never
  paste it into a chat, never pull it from the production database.
- A go-ahead before creating any Vercel project or container host for the spike.
- A ping when plan 1 is merged.

## How to start

```bash
git fetch origin
git checkout -b feature/profile-categories origin/staging
pnpm install
pnpm dev
```

Then, in Claude Code, paste:

> Read CLAUDE.md, docs/superpowers/specs/2026-11-13-timetable-design.md,
> docs/superpowers/plans/2026-11-13-timetable-00-split.md and
> docs/superpowers/plans/2026-11-13-timetable-TRACK-B-handoff.md. Then implement
> docs/superpowers/plans/2026-11-13-timetable-02-profile-categories.md task by task with
> superpowers:subagent-driven-development. Stop before Task 5 and tell me, because it waits for
> plan 1 to be merged into staging.

## Open risks you own

- Vercel's limits for Python functions are unverified. The spike measures them.
- Solve time for 250 teachers is unproven until the spike runs on real data.
- If the real timetable does not fit the lesson-block shape, write down where. That changes
  Ofek's data model, so tell him before plan 5 goes far.
