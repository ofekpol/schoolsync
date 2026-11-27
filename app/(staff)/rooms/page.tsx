import type { Route } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Settings } from "lucide-react";
import { getStaffUser } from "@/lib/auth/session";
import { requireService } from "@/lib/auth/service-guard";
import { formatCalendarDate, jerusalemDateString } from "@/lib/datetime";
import { hasPermission } from "@/lib/permissions";
import { listMyBookings } from "@/lib/rooms/bookings";
import { getDay } from "@/lib/rooms/occupancy";
import { dayOfDate } from "@/lib/rooms/week-schema";
import { getWeek } from "@/lib/rooms/week";
import type { SchoolUser } from "@/lib/rooms/guard";
import { DayQuerySchema } from "@/lib/validations/rooms";
import { RoomsDayGrid } from "@/components/rooms/RoomsDayGrid";
import { RoomsFilterBar, type RoomsFilters } from "@/components/rooms/RoomsFilterBar";

type Search = Record<string, string | string[] | undefined>;

/** URL query → filters; anything malformed falls back to "today, no filter". */
function parseFilters(search: Search, today: string): RoomsFilters {
  const flat = Object.fromEntries(
    Object.entries(search).map(([key, value]) => [key, Array.isArray(value) ? value.join(",") : value]),
  );
  const parsed = DayQuerySchema.safeParse(flat);
  const query = parsed.success ? parsed.data : {};
  return {
    date: query.date ?? today,
    periods: query.periods ?? [],
    freeOnly: query.free === "1",
    mine: query.mine === "1",
    q: query.q ?? "",
  };
}

/** Every room's day: who uses which room in each period, with filters and links to book. */
export default async function RoomsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await getStaffUser();
  if (!user) redirect("/");
  if (!user.schoolId) redirect("/auth/pending");
  await requireService(user, "rooms");
  if (!(await hasPermission(user, "rooms.book"))) notFound();
  const schoolUser = user as SchoolUser;

  const today = jerusalemDateString(new Date());
  const filters = parseFilters(await searchParams, today);
  const [week, day, mine, canManage, t, locale] = await Promise.all([
    getWeek(user.schoolId),
    getDay(user.schoolId, filters.date, { ...filters }, user.id),
    listMyBookings(schoolUser, today),
    hasPermission(user, "rooms.manage"),
    getTranslations("rooms"),
    getLocale(),
  ]);
  const dayPeriods = week?.days.find((d) => d.day === dayOfDate(filters.date))?.periods ?? [];

  return (
    <main className="space-y-6 px-4 pb-12 pt-6 md:px-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-sm text-neutral-600">{t("intro")}</p>
        </div>
        {canManage && (
          <Link href="/rooms/manage" className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50">
            <Settings aria-hidden="true" className="size-4" />
            {t("manageLink")}
          </Link>
        )}
      </header>

      <RoomsFilterBar filters={filters} dayPeriods={dayPeriods} />

      <section aria-labelledby="rooms-day-heading" className="space-y-3">
        <h2 id="rooms-day-heading" className="text-lg font-semibold">
          {formatCalendarDate(filters.date, locale)}
          {filters.date === today && <span className="ms-2 text-sm font-normal text-neutral-500">({t("today")})</span>}
        </h2>
        <DayBody week={week !== null} day={day} canManage={canManage} filtered={filters.freeOnly || filters.mine || filters.q !== ""} t={t} />
      </section>

      <section aria-labelledby="my-bookings-heading" className="space-y-2">
        <h2 id="my-bookings-heading" className="text-lg font-semibold">{t("myBookings")}</h2>
        {mine.length === 0 ? (
          <p className="text-sm text-neutral-500">{t("noBookings")}</p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
            {mine.map((booking) => (
              <li key={booking.groupId} className="px-4 py-3 text-sm">
                <Link href={`/rooms/${booking.roomId}?date=${booking.date}` as Route} className="font-medium hover:underline">
                  {booking.roomName}
                </Link>
                <span className="text-neutral-600">
                  {" · "}{formatCalendarDate(booking.date, locale)}{" · "}{t("periodsList", { list: booking.periods.join(", ") })}
                </span>
                {booking.note && <span className="block text-neutral-500">{booking.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function DayBody({ week, day, canManage, filtered, t }: {
  week: boolean;
  filtered: boolean;
  day: Awaited<ReturnType<typeof getDay>>;
  canManage: boolean;
  t: Awaited<ReturnType<typeof getTranslations<"rooms">>>;
}) {
  const note = (text: string) => <p className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600">{text}</p>;
  if (!week) return note(canManage ? `${t("noWeek")} ${t("noWeekManage")}` : t("noWeek"));
  if (day.periods.length === 0) return note(t("noSchoolDay"));
  if (day.rooms.length === 0) return note(filtered ? t("noMatch") : t("noRooms"));
  return <RoomsDayGrid day={day} />;
}
