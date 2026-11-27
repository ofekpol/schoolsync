import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getStaffUser } from "@/lib/auth/session";
import { requireService } from "@/lib/auth/service-guard";
import { isDemoUser } from "@/lib/auth/demo-guard";
import { listStaffUsers } from "@/lib/db/staff";
import { hasPermission } from "@/lib/permissions";
import { listRooms } from "@/lib/rooms/rooms";
import { getWeek } from "@/lib/rooms/week";
import { DEFAULT_WEEK } from "@/lib/rooms/week-schema";
import { RoomsList } from "@/components/rooms/RoomsList";
import { WeekEditor } from "@/components/rooms/WeekEditor";
import { WeeklySlotsGrid } from "@/components/rooms/WeeklySlotsGrid";

/** Rooms set-up for `rooms.manage`: the school's period times, its rooms, and each room's fixed weekly use. */
export default async function RoomsManagePage() {
  const user = await getStaffUser();
  if (!user) redirect("/");
  if (!user.schoolId) redirect("/auth/pending");
  await requireService(user, "rooms");
  if (!(await hasPermission(user, "rooms.manage"))) notFound();

  const [week, rooms, staff, t] = await Promise.all([
    getWeek(user.schoolId),
    listRooms(user.schoolId),
    listStaffUsers(user.schoolId),
    getTranslations("rooms"),
  ]);
  const staffOptions = staff
    .filter((member) => member.status === "active")
    .map((member) => ({ id: member.id, name: member.fullName }))
    .sort((a, b) => a.name.localeCompare(b.name, "he"));

  const section = "space-y-3 rounded-2xl border border-neutral-200 bg-neutral-50/50 p-4";
  return (
    <main className="space-y-6 px-4 pb-12 pt-6 md:px-6">
      <Link href="/rooms" className="text-sm text-violet-700 hover:underline">{t("backToRooms")}</Link>
      <header>
        <h1 className="text-2xl font-bold">{t("manage.title")}</h1>
        <p className="mt-1 text-sm text-neutral-600">{t("manage.intro")}</p>
      </header>
      {isDemoUser(user) && (
        <p role="note" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">{t("errors.demo_disabled")}</p>
      )}
      <section aria-labelledby="week-heading" className={section}>
        <h2 id="week-heading" className="text-lg font-semibold">{t("manage.weekTitle")}</h2>
        <p className="text-sm text-neutral-600">{t("manage.weekHint")}</p>
        <WeekEditor initial={week ?? DEFAULT_WEEK} />
      </section>
      <section aria-labelledby="rooms-heading" className={section}>
        <h2 id="rooms-heading" className="text-lg font-semibold">{t("manage.roomsTitle")}</h2>
        <RoomsList rooms={rooms} />
      </section>
      <section aria-labelledby="slots-heading" className={section}>
        <h2 id="slots-heading" className="text-lg font-semibold">{t("manage.slotsTitle")}</h2>
        <p className="text-sm text-neutral-600">{t("manage.slotsHint")}</p>
        <WeeklySlotsGrid week={week} rooms={rooms} staff={staffOptions} />
      </section>
    </main>
  );
}
