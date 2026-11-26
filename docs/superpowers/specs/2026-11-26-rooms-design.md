# Rooms (חדרים) and profile permissions: design

Status: agreed in conversation with Maor, 2026-11-24..26. Plan: `docs/superpowers/plans/2026-11-26-rooms.md`.

## Intent

Schools want one place to see which rooms are taken during the day, by whom, and to book a free one.
The principal sets up the rooms (and renames them) and the school's fixed weekly use of them;
teachers book what is left. Parents and anyone without a fitting profile never see it.

Access comes from the **profile**: the school's profile categories (migration 0022) gain the ability
to carry powers. A teacher can be a `viewer` for events and still book rooms, because their
"מורה" label grants it. This permission layer sits **alongside** `staff_users.role`; it does not
replace it, and nothing that roles control today changes.

## Goals

1. Profile permissions: an admin marks a category as *admin-assigned*; each of its options can carry
   powers from a fixed list in code. Staff cannot set admin-assigned labels on themselves.
2. A `rooms` service a platform admin turns on per school.
3. The school's day: days and numbered periods with start/end times, set by the principal.
4. Rooms: create, rename, reorder, archive (principal).
5. Weekly occupancy: "Room 12, every Sunday period 2: ז'2 / Dana Cohen" for the active academic year,
   with the option to free a single date.
6. One-off bookings of one or more whole periods on a date, by staff with the booking power.
7. A rooms page: every room's day period by period (free / weekly / booked by whom), and filters:
   free at date + period(s), room name, my bookings.

## Non-goals (this round)

- Room type, capacity, equipment (name only; see "Calls made").
- Deriving occupancy from the timetable's solved placements (the timetable is parked off staging).
- Notifications, approval of bookings, recurring bookings by teachers, booking on behalf of someone else.
- Replacing roles with permissions; any permission other than `rooms.book` / `rooms.manage`.

## Anti-goals

- Any way for a staff member to grant themselves a power (self-service profile save must never touch
  admin-assigned labels).
- Two people holding the same room and period on the same date.
- A parent, a guest link holder, or a staff member with no fitting label reaching the page or API.

## Permissions model

- Permissions in code: `rooms.book`, `rooms.manage`. `rooms.manage` implies `rooms.book`.
- `profile_categories.admin_assigned boolean` (default false). Only options of admin-assigned
  categories may carry permissions (`profile_category_options.permissions text[]`, DB check limits
  values to the known list).
- A staff member's powers = union of the permissions of the active options they hold in active,
  admin-assigned categories. `role = 'admin'` holds every power (as admins bypass scopes today).
  Only `status = 'active'` staff have any power. Demo users: read only.
- `/profile` shows admin-assigned categories read-only. `PUT /api/v1/profile` rejects option ids
  from admin-assigned categories (400 `admin_assigned`) and keeps the ones the admin set.
  A required admin-assigned category never blocks a staff member's own profile save.
- Admins set them from `/admin/staff` (existing `PUT /api/v1/admin/staff/[id]/labels`). Each such
  change writes an `audit_log` row (`staff.labels_set`).
- Labels in free (not admin-assigned) categories stay descriptive and grant nothing, as today.

## Rooms model

- Service: `rooms` added to `schools.services` (check constraint and `SERVICES`).
- **Week** (one per school): same shape as the timetable's week: days 0–6 (0 = Sunday), each with
  periods numbered 1..n, `start`/`end` "HH:MM", at most 12 periods a day.
- **Room**: name (unique among active rooms of the school, ≤ 60 chars), sort order, archived_at.
  Archiving keeps history; an archived room disappears from the page and cancels nothing silently:
  archiving a room with future bookings or weekly slots is refused (409 `room_in_use`).
- **Weekly slot**: room, day, period, academic year, label (e.g. "ז'2", ≤ 60 chars), optional staff
  member. Unique per (room, day, period, year).
- **Slot release**: (slot, date): the slot is free on that date only.
- **Booking**: room, date, period, staff member, optional note (≤ 200 chars), group id (one
  request for periods 3–4 = two rows, one group), canceled_at/canceled_by. Unique per
  (room, date, period) among non-canceled rows. Cancel = whole group.
- Booking rules: dates from today to the active academic year's end; the (day, period) must exist in
  the week; a period whose end time has passed (Asia/Jerusalem) cannot be booked; it must not hit a
  weekly slot (unless released for that date) or another booking. All-or-nothing per request.
- Who cancels: the booker, or anyone with `rooms.manage`.
- Changing the week: refused (409 `period_in_use`) when it drops a (day, period) that has a weekly
  slot or a future booking.
- Every write to a room's occupancy locks the room row first (`SELECT … FOR UPDATE`), so slot and
  booking checks cannot race; the unique index is the last line of defence for bookings.

## Screens

- Nav "חדרים" when the school has `rooms` and the user has `rooms.book`.
- `/rooms` (Server Component + small client parts): date (default today), filters (period(s), free
  only, name, my bookings). A rooms × periods grid on desktop, a list per room on mobile. Cell =
  free / weekly label / booker name. Monthly default from CLAUDE.md does not apply here (a day view).
- `/rooms/[id]?date=`: the room's day, period by period; select consecutive free periods, add a
  note, book; cancel own bookings.
- `/rooms/manage` (`rooms.manage`): rooms (add, rename, reorder, archive), the week editor, a room's
  weekly grid (day × period) to set/clear slots, free a slot on a date.
- `/admin/categories`: "Assigned by admin" toggle per category; permission checkboxes per option
  (only shown when admin-assigned). `/profile`: admin-assigned categories read-only.

## Approaches considered

- **Chosen: permissions on profile options, alongside roles.** Fits "a viewer teacher may book";
  later features reuse it.
- Rejected: reuse roles only (admin = principal, everyone else books). Cannot express "this viewer
  books, that one does not".
- Rejected: labels replace roles. Touches every existing check (events, staff, timetable) for no
  gain now.
- Day division: **periods**, set per school (schools differ), not free clock times. Rooms keeps its
  own week (the timetable is parked); when the timetable returns, both can share one week.
- Occupancy: **weekly slots + one-off bookings** (rooms are tied to classes most of the week).

## Constraints

From CLAUDE.md: `withSchool` for every query, RLS + cross-school tests for every new table, Zod at
every API boundary, i18n keys (he first), logical CSS properties only, dates via `lib/datetime.ts`,
new migrations only. Migration numbers: staging ends at 0022 and the parked timetable branches hold
0023–0025, so rooms starts at **0026**.

## Calls made (not discussed; change freely)

- Rooms carry a name only. Type/capacity/equipment can come later as filters.
- Viewing the page needs `rooms.book` (so "no fitting label" = no access), not just active staff.
- Demo users: rooms are read-only (demo trigger caps are not extended).
- Admin label changes are audited.
- Booking horizon = end of the active academic year; no per-user booking limits.

## Left to the builder

Exact component layout, query shapes and indexes beyond the unique ones above, polling (none needed:
refresh after own writes), copy wording.
