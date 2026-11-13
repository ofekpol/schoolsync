# Profile Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The principal defines categories with options; staff pick their options after login; the principal sees and filters staff by label.

**Architecture:** Three new RLS tables in their own schema file, domain logic in `lib/profile/`, four admin API handlers, one self-service handler. A nullable `staff_users.profile_completed_at` drives a one-time redirect to `/profile`, which only fires once the school has at least one category. Labels are descriptive only and are never read by any permission check.

**Tech Stack:** Next.js 15 App Router, Drizzle + Postgres RLS, Zod, next-intl, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-13-timetable-design.md` (section "Project 2")

**Branch:** `feature/profile-categories` from `staging`. Migration number: **0022**.

## Global Constraints

- A label never grants or removes access. No file under `app/api/v1/events/`, `lib/events/` or `lib/auth/` may import from `lib/profile/` (except the gate in Task 5).
- Until a school creates its first category, no user of that school sees any change.
- Every query on the new tables runs inside `withSchool(schoolId, fn)`.
- Nothing is hard-deleted: categories and options are archived (`archived_at`).
- Demo schools: the gate is skipped and every write route returns 403 `demo_disabled`.
- Never edit an existing migration file. Strings through `next-intl`, `he.json` first.
- Zod at every API boundary. No `any`. Functions under 50 lines, files under 400.
- Limits (named constants in `lib/validations/profile.ts`): `MAX_CATEGORIES = 30`, `MAX_OPTIONS_PER_CATEGORY = 100`, `MAX_LABEL_LENGTH = 60`.
- Tasks 1 to 4 touch nothing that plan 1 touches. **Task 5 starts only after plan 1 is merged into `staging`** (it edits `StaffShell` and `lib/nav.ts`).

## Review Focus

1. An option id from another school is submitted: 400, nothing written (Task 3).
2. Two options submitted for a single-select category, or none for a required one: 400 (Task 3).
3. An archived option that staff still hold: hidden from pickers and filters, row kept (Tasks 2, 3).
4. An editor with any label edits an event outside their scope: still `scope_violation` (Task 5).
5. The principal adds a required category after staff completed their profile: nobody is redirected again; the staff table shows who is missing it (Task 5).
6. A user opens `/profile` while the gate is active: no redirect loop (Task 5).
7. Deactivated staff: not listed under any label (Task 3).

---

### Task 1: tables, schema file and RLS

**Files:**
- Create: `db/migrations/0022_profile_categories.sql`
- Create: `lib/db/schema-profile.ts`
- Modify: `lib/db/schema.ts` (`staffUsers.profileCompletedAt`; export `schoolIsolation`)
- Modify: `lib/db/client.ts` (drizzle schema = `{ ...schema, ...profileSchema }`), `drizzle.config.ts` (`schema` becomes an array of both files)
- Test: `test/integration/profile-rls.test.ts`

**Interfaces:**
- Produces (Drizzle tables): `profileCategories`, `profileCategoryOptions`, `staffProfileOptions`, and `staffUsers.profileCompletedAt`

```
profile_categories        id uuid pk, school_id fk schools cascade, name text, multi_select bool default true,
                          required bool default false, sort_order int default 0, archived_at timestamptz null,
                          created_at; unique (school_id, name) WHERE archived_at IS NULL
profile_category_options  id uuid pk, school_id fk, category_id fk profile_categories cascade, label text,
                          sort_order int default 0, archived_at timestamptz null;
                          unique (category_id, label) WHERE archived_at IS NULL
staff_profile_options     staff_user_id fk staff_users cascade, option_id fk profile_category_options cascade,
                          school_id fk; pk (staff_user_id, option_id); index (school_id, option_id)
staff_users               + profile_completed_at timestamptz null
```

- [ ] **Step 1: Write the failing RLS test** (pattern: `test/integration/grade-colors.test.ts`). For each of the three tables: a row inserted for school A is readable inside `withSchool(testSchoolA)`, invisible inside `withSchool(testSchoolB)`, and inserting a row with `schoolId: testSchoolA` inside `withSchool(testSchoolB)` rejects. Clean up in `afterAll`.

- [ ] **Step 2: Run, expect FAIL** (tables missing).

- [ ] **Step 3: Write the migration.** Follow `0014_school_grade_colors.sql` exactly for each table: `ENABLE` and `FORCE ROW LEVEL SECURITY`, the `school_isolation` policy with the same `USING` / `WITH CHECK` text. Add the `staff_users` column with `ADD COLUMN IF NOT EXISTS`.

- [ ] **Step 4: Write `schema-profile.ts`** mirroring the migration, and wire both files into `client.ts` and `drizzle.config.ts`.

- [ ] **Step 5: Run** `pnpm db:migrate && pnpm vitest run test/integration/profile-rls.test.ts && pnpm tsc`, expect PASS.

- [ ] **Step 6: Commit** `feat: profile category tables`

---

### Task 2: category management (domain + admin API)

**Files:**
- Create: `lib/validations/profile.ts`, `lib/profile/categories.ts`
- Create: `app/api/v1/admin/categories/route.ts` (GET, POST), `app/api/v1/admin/categories/[id]/route.ts` (PUT, DELETE), `app/api/v1/admin/categories/order/route.ts` (PUT)
- Test: `test/integration/profile-categories.test.ts`, `test/unit/admin/categories-route.test.ts`

**Interfaces:**
- Produces:

```ts
interface ProfileOption { id: string; label: string; sortOrder: number }
interface ProfileCategory {
  id: string; name: string; multiSelect: boolean; required: boolean; sortOrder: number;
  options: ProfileOption[];           // active options only, by sortOrder
}
// lib/validations/profile.ts
CategoryInput = { name: string; multiSelect: boolean; required: boolean;
                  options: Array<{ id?: string; label: string }> }   // order = sortOrder

// lib/profile/categories.ts
listCategories(schoolId: string): Promise<ProfileCategory[]>          // active only, by sortOrder
countCategories(schoolId: string): Promise<number>                    // active only
createCategory(schoolId: string, input: CategoryInput): Promise<ProfileCategory>
replaceCategory(schoolId: string, id: string, input: CategoryInput): Promise<ProfileCategory | null>
archiveCategory(schoolId: string, id: string): Promise<boolean>
reorderCategories(schoolId: string, ids: string[]): Promise<void>
```

- `replaceCategory`: options sent with an `id` are updated; options without one are created; active options not sent are archived (their staff rows stay).
- Routes: admin only, `status === "active"`, demo → 403 `demo_disabled`. `GET` → `{ categories }`. `POST` → 201, 409 `duplicate_name`, 422 `limit_reached`. `PUT [id]` → 200, 404. `DELETE [id]` → 204 (archive). `PUT order` body `{ ids: string[] }` → 204.

- [ ] **Step 1: Failing integration tests**
  - create a category with options "מתמטיקה", "אנגלית"; `listCategories` returns it with both, in order
  - `replaceCategory` renaming one option, adding one, omitting one: the omitted one is absent from the list and its row has `archived_at` set
  - a second active category with the same name rejects; after archiving the first, the name is free
  - creating the 31st category rejects with the limit error
  - school B's `listCategories` is empty

- [ ] **Step 2: Run, expect FAIL. Step 3: Implement the validation and domain files. Step 4: Run, expect PASS.**

- [ ] **Step 5: Failing route tests** (mock `getStaffUser` and the domain module, as `test/unit/admin/staff-route.test.ts` does): editor → 403; deactivated admin → 403; demo admin → 403 `demo_disabled`; a 61-character name → 400; duplicate → 409; happy path → 201 with the response parsed by a Zod schema.

- [ ] **Step 6: Implement the routes, run, expect PASS.**

- [ ] **Step 7: Commit** `feat: manage profile categories`

---

### Task 3: staff labels (domain + API)

**Files:**
- Create: `lib/profile/staff-labels.ts`
- Create: `app/api/v1/profile/route.ts` (GET, PUT, self), `app/api/v1/admin/staff/[id]/labels/route.ts` (PUT, admin)
- Test: `test/integration/profile-staff-labels.test.ts`, `test/unit/profile/profile-route.test.ts`

**Interfaces:**
- Consumes: `listCategories` (Task 2)
- Produces:

```ts
getStaffOptionIds(schoolId: string, staffUserId: string): Promise<string[]>   // active options only
setStaffOptions(schoolId: string, staffUserId: string, optionIds: string[]): Promise<void>
   // replaces the user's active labels, sets profile_completed_at = now(); throws ProfileValidationError
listStaffLabels(schoolId: string): Promise<Record<string, string[]>>   // staffUserId -> active optionIds, active staff only
class ProfileValidationError extends Error { code: "unknown_option" | "too_many" | "required_missing" }
```

- Validation in `setStaffOptions`: every id is an active option of an active category of this school (`unknown_option`); at most one per single-select category (`too_many`); at least one per required category (`required_missing`).
- `GET /api/v1/profile` → `{ categories, selected: string[] }`. `PUT` body `{ optionIds: string[] }` → 204, 400 with the error code. Any active staff role. Demo → 403.
- `PUT /api/v1/admin/staff/[id]/labels`: admin only, same body and errors, 404 when the staff user is not in the admin's school.

- [ ] **Step 1: Failing integration tests**, one per Review Focus item 1, 2, 3 and 7, plus: a successful `setStaffOptions` sets `profile_completed_at`; calling it again replaces the previous selection.

- [ ] **Step 2: Run, expect FAIL. Step 3: Implement. Step 4: Run, expect PASS.**

- [ ] **Step 5: Route tests**: signed out → 401; viewer can PUT their own profile → 204; `ProfileValidationError("too_many")` → 400 `{ error: "too_many" }`; editor calling the admin route → 403.

- [ ] **Step 6: Implement the routes, run, expect PASS. Commit** `feat: staff profile labels`

---

### Task 4: screens

**Files:**
- Create: `app/(admin)/admin/categories/page.tsx`, `components/profile/CategoryManager.tsx`, `components/profile/CategoryEditor.tsx`
- Create: `app/profile/page.tsx`, `components/profile/ProfileForm.tsx`
- Modify: `messages/he.json`, `messages/en.json` (`profile.*`, `admin.categories.*`)
- Test: `test/unit/profile/profile-form.test.tsx`

**Interfaces:**
- Consumes: the Task 2 and Task 3 routes; `ProfileCategory`
- Produces: `<ProfileForm categories={ProfileCategory[]} selected={string[]} submitUrl={string} onSaved?={() => void} />`, reused by the admin "edit labels" dialog in Task 5

- `/admin/categories`: admin only (others → `/dashboard`), demo sees a read-only note. A list of categories; each opens an editor with name, "אפשר לבחור כמה" (multi-select), "חובה" (required) and an options list with add, rename, reorder and remove. Model it on `components/admin/event-types/EventTypeManager.tsx`.
- `/profile`: lives outside the `(staff)` group, like `/auth/change-password`, so the Task 5 gate cannot loop. It does its own check: signed out → login; no categories → the user's home path. Shows one fieldset per category (checkboxes for multi-select, radios for single), a required mark, and Save. After saving it goes to the home path.

- [ ] **Step 1: Failing component test** for `ProfileForm`: a single-select category renders radios; a multi-select renders checkboxes; Save is disabled while a required category has no choice; submitting sends `{ optionIds }` with the ticked ids.

- [ ] **Step 2: Run, expect FAIL. Step 3: Build the components and pages. Step 4: Run, expect PASS; `pnpm tsc && pnpm lint` clean.**

- [ ] **Step 5: Commit** `feat: category management and profile pages`

---

### Task 5: the gate, navigation and the staff table (after plan 1 is merged)

**Files:**
- Create: `lib/profile/gate.ts`
- Modify: `lib/db/staff.ts` (`StaffUserRecord.profileCompletedAt`, selected in `getStaffUserByAuthId`)
- Modify: `components/staff/StaffShell.tsx` (from plan 1), `lib/nav.ts`
- Modify: `app/(admin)/admin/staff/page.tsx`, `components/admin/StaffTable.tsx`, `components/admin/StaffMobileList.tsx`
- Modify: `messages/*.json` (`nav.categories`, `admin.staff.labels.*`)
- Test: `test/unit/profile/gate.test.ts`, `test/unit/nav.test.ts`, `test/integration/profile-no-access.test.ts`, `test/e2e/profile-categories.spec.ts`

**Interfaces:**
- Consumes: `countCategories` (Task 2), `listStaffLabels` (Task 3), `ProfileForm` (Task 4), `StaffShell` and `buildNavLinks` (plan 1)
- Produces: `needsProfile(user: StaffUserRecord): Promise<boolean>`

- `needsProfile` is true only when all hold: `user.schoolId` is set, the user is not a demo user, `user.profileCompletedAt === null`, and `countCategories(schoolId) > 0`.
- `StaffShell` redirects to `/profile` when `needsProfile(user)`.
- `buildNavLinks`: admins get `{ href: "/admin/categories", label: t("categories") }` after the staff link.
- Staff table: a "תיוגים" column with the user's labels as chips, a label filter above the table (one option at a time, plus "חסר תיוג חובה"), and an "edit labels" action opening `ProfileForm` against the admin route.

- [ ] **Step 1: Failing unit tests** for `needsProfile`: one test per condition above turning it false, one where all hold. Add to `nav.test.ts`: admin gets `/admin/categories`; editor does not.

- [ ] **Step 2: Run, expect FAIL. Step 3: Implement the gate, the record field and the nav link. Step 4: Run, expect PASS.**

- [ ] **Step 5: Integration test** `profile-no-access.test.ts`: an editor scoped to grade 7, holding every label of school A, still gets `scope_violation` when creating a grade 8 event through the events route (reuse the setup in `test/integration/event-type-scope.test.ts`).

- [ ] **Step 6: Staff table changes.** `page.tsx` loads `listCategories` and `listStaffLabels` and passes them down; filtering is client-side.

- [ ] **Step 7: E2E** `test/e2e/profile-categories.spec.ts` against a local or preview stack with `TEST_LOGIN_ENABLED` (not the public demo, where writes are disabled):
  - admin creates category "מקצוע" with options "מתמטיקה", "אנגלית"
  - an editor logs in, is sent to `/profile`, picks "מתמטיקה", lands on the dashboard, and is not sent back on the next page load
  - the admin filters the staff table by "מתמטיקה" and sees that editor

- [ ] **Step 8: Full check.** `pnpm lint && pnpm tsc && pnpm test && pnpm build`, all green; existing Playwright suite unchanged.

- [ ] **Step 9: Commit** `feat: profile gate, categories nav and staff labels`

---

## After merging

- Staging: with no categories, log in as each role and confirm nothing changed.
- Production: no SQL. Kfar Galim staff are asked for their labels only after the principal creates the first category; tell the principal that before they do.
