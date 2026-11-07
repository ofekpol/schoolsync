"use client";

import { type ReactNode, useCallback, useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { GanttWeekly } from "@/components/Gantt/GanttWeekly";
import { EventDrawer } from "@/components/Gantt/EventDrawer";
import { ExportToGoogleCalendarButton } from "@/components/ExportToGoogleCalendarButton";
import { YearCalendarGrid } from "@/components/YearCalendarGrid";
import { CalendarViewToggle } from "./CalendarViewToggle";
import { QuickEventDialog } from "./QuickEventDialog";
import { ViewSwitchStatus } from "./ViewSwitchStatus";
import { buildWeeklyModel, type WeeklyModel } from "@/lib/views/gantt-weekly";
import { buildCalendarModel } from "@/lib/views/calendar";
import type { CalendarMonth } from "@/lib/views/calendar";
import type { CalendarPrintOptions } from "@/components/ExportToGoogleCalendarButton";
import { toCalendarInputEvents } from "@/lib/views/calendar-event-input";
import type { CalendarRange } from "@/lib/views/date-range";
import type { EventType } from "@/components/wizard/WizardShell";
import {
  shouldShowDashboardGradeFilter,
  visibleWeeklyGrades,
} from "@/lib/dashboard/grade-filter";
import type { GradeColorMap } from "@/lib/grade-colors";
import { GradeSelector } from "./GradeSelector";
import { GradeColorLegend } from "@/components/GradeColorLegend";
import { TOOLBAR_BUTTON_CLASS } from "./toolbar-styles";

interface SerializedEvent {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  description: string | null;
  location: string | null;
  eventTypeId: string;
  eventTypeKey: string;
  eventTypeLabelHe: string;
  eventTypeColor: string;
  eventTypeGlyph: string;
  grades: number[];
  status: "approved" | "canceled";
  isCanceled: boolean;
  isUpdated: boolean;
  canEdit: boolean;
}

interface Props {
  view: "weekly" | "monthly";
  weeklyModel?: WeeklyModel;
  events: SerializedEvent[];
  calendarRange: CalendarRange;
  schoolName: string;
  eventTypes: EventType[];
  allowedGrades: number[];
  /** Grades in focus. Empty = no focus (every grade shown normally). */
  selectedGrades: number[];
  gradeColors: GradeColorMap;
  canCreateEvents?: boolean;
  /** Opens this event's dialog on first render (deep link from the smart adder). */
  initialEventId?: string;
  /** Extra creation actions (e.g. the smart adder) shown beside "new event". */
  createActions?: ReactNode;
  /** Extra actions shown beside the export button (e.g. admin calendar import). */
  exportActions?: ReactNode;
}

/**
 * Dashboard calendar wrapper — segmented toggle (weekly/monthly) + day-clicks
 * open a compact event dialog with `date` pre-filled.
 * Toggle state is URL-driven via `?view=`. The grade selection is a focus, not a
 * filter: weekly shows only the selected grade rows, monthly dims other grades.
 */
export function DashboardCalendar({
  view,
  weeklyModel,
  events,
  calendarRange,
  schoolName,
  eventTypes,
  allowedGrades,
  selectedGrades,
  gradeColors,
  canCreateEvents = true,
  initialEventId,
  createActions,
  exportActions,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [isSwitchingView, startViewTransition] = useTransition();
  const t = useTranslations("dashboard");
  const [currentView, setCurrentView] = useState(view);
  const [visibleEvents, setVisibleEvents] = useState(events);
  const [selectedGradeState, setSelectedGradeState] = useState(selectedGrades);
  const deferredSelectedGrades = useDeferredValue(selectedGradeState);
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialEventId ?? null);
  const [printMonthKey, setPrintMonthKey] = useState<string | null>(null);
  const allowedGradeOptions = useMemo(
    () => Array.from(new Set(allowedGrades)).sort((a, b) => a - b),
    [allowedGrades],
  );
  const showGradeFilter = shouldShowDashboardGradeFilter(allowedGradeOptions);
  const displayEvents = visibleEvents;
  const eventMap = useMemo(
    () => new Map(displayEvents.map((event) => [event.id, event])),
    [displayEvents],
  );
  const selectedEvent = selectedEventId ? (eventMap.get(selectedEventId) ?? null) : null;
  const hydratedEvents = useMemo(
    () =>
      displayEvents.map((event) => ({
        ...event,
        startAt: new Date(event.startAt),
        endAt: new Date(event.endAt),
      })),
    [displayEvents],
  );
  const displayWeeklyModel = useMemo(() => {
    if (!weeklyModel || currentView !== "weekly") return undefined;
    return buildWeeklyModel(
      weeklyModel.weekStart,
      hydratedEvents,
      visibleWeeklyGrades(allowedGradeOptions, deferredSelectedGrades),
      new Date(),
    );
  }, [allowedGradeOptions, currentView, deferredSelectedGrades, hydratedEvents, weeklyModel]);
  const buildMonths = useCallback(
    () =>
      buildCalendarModel({
        year: calendarRange,
        events: toCalendarInputEvents(hydratedEvents),
      }).months,
    [calendarRange, hydratedEvents],
  );
  // Months are only needed for the monthly grid and the print dialog, so build
  // them on demand instead of on every render of the weekly view.
  const displayMonths = useMemo(
    () => (currentView === "monthly" ? buildMonths() : undefined),
    [buildMonths, currentView],
  );
  const loadPrintCalendar = useCallback(async (): Promise<CalendarPrintOptions> => {
    const printMonths = displayMonths ?? buildMonths();
    return {
      months: printMonths,
      schoolName,
      yearLabel: calendarRange.label,
      gradeColors,
      defaultMonthIndex: monthIndexForKey(printMonths, printMonthKey),
    };
  }, [buildMonths, calendarRange.label, displayMonths, gradeColors, printMonthKey, schoolName]);
  const updatePrintMonth = useCallback((month: CalendarMonth) => {
    setPrintMonthKey(monthKey(month.year, month.monthIndex));
  }, []);

  useEffect(() => setCurrentView(view), [view]);
  useEffect(() => setVisibleEvents(events), [events]);
  useEffect(() => setSelectedGradeState(selectedGrades), [selectedGrades]);
  useEffect(() => {
    if (currentView === "weekly" && displayWeeklyModel) {
      setPrintMonthKey(
        monthKey(
          displayWeeklyModel.weekStart.getUTCFullYear(),
          displayWeeklyModel.weekStart.getUTCMonth() + 1,
        ),
      );
    }
  }, [currentView, displayWeeklyModel]);

  function refreshInBackground() {
    startTransition(() => router.refresh());
  }

  function setView(next: "weekly" | "monthly") {
    if (next === currentView) return;
    const params = new URLSearchParams(window.location.search);
    params.set("view", next);
    startViewTransition(() => setCurrentView(next));
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
  }

  function updateGradeSelection(nextGrades: number[]) {
    const params = new URLSearchParams(window.location.search);
    params.delete("grades");
    for (const grade of nextGrades) params.append("grades", String(grade));
    setSelectedGradeState(nextGrades);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
  }

  function openNewEvent(dateIso: string) {
    setPendingDate(dateIso);
  }

  async function saveSelectedEvent(patch: {
    title: string;
    description?: string;
    location?: string;
    eventTypeId: string;
    grades: number[];
    startAt: string;
    endAt: string;
    allDay: boolean;
  }): Promise<boolean> {
    if (!selectedEvent?.canEdit) return false;
    const res = await fetch(`/api/v1/events/${selectedEvent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return false;
    const selectedType = eventTypes.find((type) => type.id === patch.eventTypeId);
    const updatedEvent = {
      ...selectedEvent,
      ...patch,
      description: patch.description ?? null,
      location: patch.location ?? null,
      eventTypeKey: selectedType?.key ?? selectedEvent.eventTypeKey,
      eventTypeLabelHe: selectedType?.labelHe ?? selectedEvent.eventTypeLabelHe,
      eventTypeColor: selectedType?.colorHex ?? selectedEvent.eventTypeColor,
      eventTypeGlyph: selectedType?.glyph ?? selectedEvent.eventTypeGlyph,
      status: "approved" as const,
      isCanceled: false,
      isUpdated: true,
    };
    setVisibleEvents((current) =>
      current.map((event) => (event.id === selectedEvent.id ? updatedEvent : event)),
    );
    refreshInBackground();
    return true;
  }

  async function deleteSelectedEvent(): Promise<boolean> {
    if (!selectedEvent?.canEdit) return false;
    const res = await fetch(`/api/v1/events/${selectedEvent.id}`, { method: "DELETE" });
    if (!res.ok) return false;
    const body = (await res.json().catch(() => null)) as { status?: string } | null;
    if (body?.status === "canceled") {
      setVisibleEvents((current) =>
        current.map((event) =>
          event.id === selectedEvent.id
            ? { ...event, status: "canceled", isCanceled: true, canEdit: false }
            : event,
        ),
      );
    } else {
      setSelectedEventId(null);
      setVisibleEvents((current) => current.filter((event) => event.id !== selectedEvent.id));
    }
    refreshInBackground();
    return true;
  }

  async function dismissSelectedCanceledEvent(): Promise<boolean> {
    if (!selectedEvent?.isCanceled) return false;
    const res = await fetch(`/api/v1/events/${selectedEvent.id}`, { method: "DELETE" });
    if (!res.ok) return false;
    const body = (await res.json().catch(() => null)) as { status?: string } | null;
    if (body?.status !== "dismissed") return false;
    setSelectedEventId(null);
    setVisibleEvents((current) => current.filter((event) => event.id !== selectedEvent.id));
    return true;
  }

  function addPublishedEvent(event: SerializedEvent) {
    setVisibleEvents((current) => [event, ...current.filter((item) => item.id !== event.id)]);
    refreshInBackground();
  }

  return (
    <div aria-busy={isSwitchingView}>
      <div className="flex flex-wrap items-center gap-3 px-6 pt-4">
        <div className="flex items-center gap-2">
          <CalendarViewToggle active={currentView === "weekly"} onClick={() => setView("weekly")}>
            {t("viewWeekly")}
          </CalendarViewToggle>
          <CalendarViewToggle active={currentView === "monthly"} onClick={() => setView("monthly")}>
            {t("viewMonthly")}
          </CalendarViewToggle>
          <ViewSwitchStatus pending={isSwitchingView} />
        </div>
        <ExportToGoogleCalendarButton
          labelKey="shortButton"
          loadPrintCalendar={loadPrintCalendar}
          buttonClassName={TOOLBAR_BUTTON_CLASS}
        />
        {exportActions}
      </div>

      {showGradeFilter && (
        <GradeSelector
          grades={allowedGradeOptions}
          selected={selectedGradeState}
          gradeColors={gradeColors}
          onChange={updateGradeSelection}
        />
      )}

      {canCreateEvents && (
        <div className={`flex flex-wrap items-center justify-start gap-2 px-6 ${showGradeFilter ? "pt-3" : "pt-4"}`}>
          <button
            type="button"
            onClick={() => openNewEvent(new Date().toISOString().slice(0, 10))}
            className="sg-button-primary rounded-md px-4 py-2 text-sm"
          >
            {t("newEvent")}
          </button>
          {createActions}
        </div>
      )}

      {currentView === "weekly" && displayWeeklyModel && (
        <GanttWeekly
          model={displayWeeklyModel}
          events={displayEvents}
          gradeColors={gradeColors}
          onDayClick={canCreateEvents ? openNewEvent : undefined}
          onEventClick={setSelectedEventId}
          onWeekChange={(weekStart) =>
            setPrintMonthKey(monthKey(weekStart.getUTCFullYear(), weekStart.getUTCMonth() + 1))
          }
          navigationMode="local"
        />
      )}
      {currentView === "monthly" && displayMonths && (
        <YearCalendarGrid
          months={displayMonths}
          yearLabel={calendarRange.label}
          schoolName={schoolName}
          gradeColors={gradeColors}
          selectedGrades={deferredSelectedGrades}
          onDayClick={canCreateEvents ? openNewEvent : undefined}
          onEventClick={setSelectedEventId}
          onMonthChange={updatePrintMonth}
        />
      )}
      {currentView === "monthly" && displayMonths && (
        <GradeColorLegend
          gradeColors={gradeColors}
          showDimmed={deferredSelectedGrades.length > 0}
        />
      )}

      {canCreateEvents && (
        <QuickEventDialog
          open={pendingDate !== null}
          dateIso={pendingDate}
          eventTypes={eventTypes}
          allowedGrades={allowedGradeOptions}
          onClose={() => setPendingDate(null)}
          onPublished={addPublishedEvent}
        />
      )}
      <EventDrawer
        event={
          selectedEvent
            ? {
                ...selectedEvent,
                startAt: new Date(selectedEvent.startAt),
                endAt: new Date(selectedEvent.endAt),
              }
            : null
        }
        canEdit={selectedEvent?.canEdit ?? false}
        eventTypes={eventTypes}
        allowedGrades={allowedGradeOptions}
        onSave={saveSelectedEvent}
        onDelete={deleteSelectedEvent}
        onDismiss={dismissSelectedCanceledEvent}
        onClose={() => setSelectedEventId(null)}
      />
    </div>
  );
}

function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex).padStart(2, "0")}`;
}

function monthIndexForKey(months: CalendarMonth[], key: string | null): number {
  if (!key) return 0;
  const index = months.findIndex((month) => monthKey(month.year, month.monthIndex) === key);
  return index >= 0 ? index : 0;
}
