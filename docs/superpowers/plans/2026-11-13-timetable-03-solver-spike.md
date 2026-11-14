# Solver Spike Plan: retired

Retired on 2026-11-14. Do not execute.

This spike waited for Kfar Galim's real timetable file, which will not arrive (spec addendum
of 2026-11-14). Nothing from it was built.

What replaced it:

| The spike was going to | Now happens in |
|---|---|
| Generate a synthetic 250-teacher school | Plan 5a's demo generator (`lib/timetable/demo/generate.ts`), run with placeholder teachers only |
| Time the solve and compare hosts (Vercel Python function or a container) | Plan 4, first task, timeboxed to one day; the result is added to the spec |
| Convert the real file and list where it does not fit the lesson-block shape | Not done. Waits for a school to supply a file |
| Find constraint types the real timetable relies on | Not done. The demo uses the types listed under plan 6 in the split document |

The pass criteria still apply to plan 4: three options for a 250-teacher school within 5
minutes in total, no teacher or class double-booked, and the run inside the host's limits with
2x headroom.

See `2026-11-13-timetable-00-split.md`.
