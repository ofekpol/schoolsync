import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Cell, DayView } from "@/lib/rooms/day";
import { cn } from "@/lib/utils";

type T = Awaited<ReturnType<typeof getTranslations<"rooms">>>;

const CELL_BASE = "block h-full min-h-14 rounded-lg border px-2 py-1.5 text-start text-xs leading-tight";

function CellContent({ cell, roomId, roomName, date, t }: { cell: Cell; roomId: string; roomName: string; date: string; t: T }) {
  if (cell.state === "free") {
    return (
      <Link
        href={`/rooms/${roomId}?date=${date}&period=${cell.period}`}
        aria-label={t("bookThis", { room: roomName, period: cell.period })}
        className={cn(CELL_BASE, "border-emerald-200 bg-emerald-50 font-medium text-emerald-900 hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-emerald-700")}
      >
        {t("free")}
      </Link>
    );
  }
  if (cell.state === "weekly") {
    return (
      <div className={cn(CELL_BASE, "border-neutral-200 bg-neutral-100 text-neutral-800")}>
        <span className="me-1 rounded bg-neutral-700 px-1 text-[10px] font-semibold text-white">{t("weekly")}</span>
        <span className="font-medium">{cell.label}</span>
        {cell.staffName && <span className="block text-neutral-600">{cell.staffName}</span>}
      </div>
    );
  }
  return (
    <div
      className={cn(
        CELL_BASE,
        cell.mine ? "border-violet-300 bg-violet-100 text-violet-950" : "border-amber-200 bg-amber-50 text-amber-950",
      )}
    >
      <span className="sr-only">{t("booked")}: </span>
      {cell.mine && <span className="me-1 rounded bg-violet-700 px-1 text-[10px] font-semibold text-white">{t("mine")}</span>}
      <span className="font-medium">{cell.staffName}</span>
      {cell.note && <span className="block text-current/80">{cell.note}</span>}
    </div>
  );
}

/** Rooms × periods for one date: a table from `md` up, one card per room below it. */
export async function RoomsDayGrid({ day }: { day: DayView }) {
  const t = await getTranslations("rooms");
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-separate border-spacing-1 text-sm">
          <thead>
            <tr>
              <th scope="col" className="w-40 text-start font-semibold text-neutral-600">{t("room")}</th>
              {day.periods.map((p) => (
                <th key={p.period} scope="col" className="min-w-24 text-start font-semibold text-neutral-600">
                  {t("period", { number: p.period })}
                  <span className="block text-xs font-normal text-neutral-500" dir="ltr">
                    {p.start}–{p.end}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {day.rooms.map((room) => (
              <tr key={room.id}>
                <th scope="row" className="text-start font-medium">
                  <Link href={`/rooms/${room.id}?date=${day.date}`} className="hover:underline">{room.name}</Link>
                </th>
                {room.cells.map((cell) => (
                  <td key={cell.period} className="h-14 align-top">
                    <CellContent cell={cell} roomId={room.id} roomName={room.name} date={day.date} t={t} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-3 md:hidden">
        {day.rooms.map((room) => (
          <li key={room.id} className="rounded-xl border border-neutral-200 bg-white p-3">
            <Link href={`/rooms/${room.id}?date=${day.date}`} className="font-semibold hover:underline">{room.name}</Link>
            <ol className="mt-2 grid grid-cols-2 gap-2">
              {room.cells.map((cell) => (
                <li key={cell.period}>
                  <span className="mb-0.5 block text-xs text-neutral-500">{t("period", { number: cell.period })}</span>
                  <CellContent cell={cell} roomId={room.id} roomName={room.name} date={day.date} t={t} />
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ul>
    </>
  );
}
