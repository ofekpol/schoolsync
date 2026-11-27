import type { Route } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getStaffUser } from "@/lib/auth/session";
import { requireService } from "@/lib/auth/service-guard";
import { isDemoUser } from "@/lib/auth/demo-guard";
import { formatCalendarDate, jerusalemDateString } from "@/lib/datetime";
import { hasPermission } from "@/lib/permissions";
import { getDay } from "@/lib/rooms/occupancy";
import { DateSchema, PeriodSchema, RoomIdSchema } from "@/lib/validations/rooms";
import { RoomDayBooking } from "@/components/rooms/RoomDayBooking";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string; period?: string }>;
}

/** One room's day: book free periods in a row, cancel your own (managers: anyone's). */
export default async function RoomDayPage({ params, searchParams }: PageProps) {
  const user = await getStaffUser();
  if (!user) redirect("/");
  if (!user.schoolId) redirect("/auth/pending");
  await requireService(user, "rooms");
  if (!(await hasPermission(user, "rooms.book"))) notFound();

  const id = RoomIdSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const search = await searchParams;
  const today = jerusalemDateString(new Date());
  const date = DateSchema.safeParse(search.date).data ?? today;
  const period = PeriodSchema.safeParse(Number(search.period)).data;

  const [day, canManage, t, locale] = await Promise.all([
    getDay(user.schoolId, date, {}, user.id),
    hasPermission(user, "rooms.manage"),
    getTranslations("rooms"),
    getLocale(),
  ]);
  const room = day.rooms.find((r) => r.id === id.data);
  if (!room) notFound();

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 pb-12 pt-6">
      <Link href={`/rooms?date=${date}` as Route} className="text-sm text-violet-700 hover:underline">
        {t("backToRooms")}
      </Link>
      <header>
        <h1 className="text-2xl font-bold">{room.name}</h1>
        <p className="text-neutral-600">{formatCalendarDate(date, locale)}</p>
      </header>
      <form method="get" className="flex items-end gap-2">
        <label className="flex flex-col text-xs text-neutral-600">
          {t("date")}
          <input type="date" name="date" defaultValue={date} min={today} required className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900" />
        </label>
        <button type="submit" className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">{t("apply")}</button>
      </form>
      {day.periods.length === 0 ? (
        <p className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600">{t("noSchoolDay")}</p>
      ) : (
        <RoomDayBooking
          key={`${room.id}-${date}`}
          roomId={room.id}
          date={date}
          periods={day.periods}
          cells={room.cells}
          initialPeriod={period}
          canManage={canManage}
          readOnly={isDemoUser(user)}
        />
      )}
    </main>
  );
}
