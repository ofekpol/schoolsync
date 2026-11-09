import { addCalendarDays } from "@/lib/datetime";
import { buildEventTimeRange } from "@/lib/events/date-range";

/**
 * A realistic year of events for the sales demo school (grades 7–12).
 * shortcut: dates are fixed to the 2026–2027 school year; add the next year's
 * list before September 2027.
 */
export const DEMO_EVENTS_YEAR = { label: "2026-2027", startDate: "2026-09-01", endDate: "2027-06-30" } as const;

const ALL = [7, 8, 9, 10, 11, 12] as const;
const MIDDLE = [7, 8, 9] as const;
const HIGH = [10, 11, 12] as const;

export interface DemoEvent {
  title: string;
  typeKey: string;
  startDate: string;
  endDate?: string;
  /** "HH:MM-HH:MM"; omitted = all day. */
  time?: string;
  grades: readonly number[];
  location?: string;
  description?: string;
}

const HOLIDAYS: DemoEvent[] = [
  { title: "פתיחת שנת הלימודים", typeKey: "ceremony", startDate: "2026-09-01", time: "08:00-09:30", grades: ALL, location: "חצר בית הספר", description: "טקס פתיחה וקבלת פנים לשכבה ז'" },
  { title: "חופשת ראש השנה", typeKey: "holiday", startDate: "2026-09-11", endDate: "2026-09-13", grades: ALL },
  { title: "חופשת יום כיפור", typeKey: "holiday", startDate: "2026-09-20", endDate: "2026-09-21", grades: ALL },
  { title: "חופשת סוכות", typeKey: "vacation", startDate: "2026-09-25", endDate: "2026-10-04", grades: ALL },
  { title: "חופשת חנוכה", typeKey: "vacation", startDate: "2026-12-06", endDate: "2026-12-11", grades: ALL },
  { title: "ט\"ו בשבט - נטיעות", typeKey: "general", startDate: "2027-01-22", time: "09:00-12:00", grades: MIDDLE, location: "פארק העיר" },
  { title: "תחפושות פורים", typeKey: "general", startDate: "2027-03-22", time: "08:00-12:00", grades: ALL, description: "יום מקוצר, לימודים עד 12:00" },
  { title: "חופשת פורים", typeKey: "holiday", startDate: "2027-03-23", endDate: "2027-03-24", grades: ALL },
  { title: "חופשת פסח", typeKey: "vacation", startDate: "2027-04-14", endDate: "2027-04-28", grades: ALL },
  { title: "טקס יום השואה", typeKey: "ceremony", startDate: "2027-05-04", time: "10:00-11:00", grades: ALL, location: "אולם הספורט" },
  { title: "טקס יום הזיכרון", typeKey: "ceremony", startDate: "2027-05-11", time: "10:45-12:00", grades: ALL, location: "חצר בית הספר" },
  { title: "יום העצמאות", typeKey: "holiday", startDate: "2027-05-12", grades: ALL },
  { title: "ל\"ג בעומר", typeKey: "holiday", startDate: "2027-05-25", grades: ALL },
  { title: "חופשת שבועות", typeKey: "holiday", startDate: "2027-06-10", endDate: "2027-06-11", grades: ALL },
  { title: "סיום שנת הלימודים - חטיבת ביניים", typeKey: "ceremony", startDate: "2027-06-30", time: "09:00-11:00", grades: MIDDLE, location: "אולם הספורט" },
  { title: "טקס סיום י\"ב", typeKey: "ceremony", startDate: "2027-06-17", time: "19:00-21:30", grades: [12], location: "האמפיתיאטרון" },
];

const SCHOOL_LIFE: DemoEvent[] = [
  { title: "טקס לזכר יצחק רבין", typeKey: "ceremony", startDate: "2026-10-22", time: "08:15-09:00", grades: ALL, location: "חצר בית הספר" },
  { title: "יום ספורט בית ספרי", typeKey: "sport", startDate: "2026-10-29", time: "08:00-13:00", grades: ALL, location: "מגרשי הספורט" },
  { title: "צילומי מחזור", typeKey: "general", startDate: "2026-11-17", time: "08:00-14:00", grades: ALL, location: "ספריית בית הספר" },
  { title: "יום המעשים הטובים", typeKey: "general", startDate: "2027-03-16", time: "08:00-13:00", grades: ALL },
  { title: "יריד מדע ויזמות", typeKey: "workshop", startDate: "2027-02-25", time: "10:00-14:00", grades: [8, 9], location: "אולם הספורט" },
  { title: "הצגת תיאטרון: \"כולם היו בניי\"", typeKey: "lecture", startDate: "2026-12-22", time: "11:00-13:30", grades: [11], location: "היכל התרבות" },
  { title: "מרתון קריאה", typeKey: "general", startDate: "2027-01-12", time: "08:00-12:00", grades: [7], location: "הספרייה" },
  { title: "מסע לפולין - מפגש הכנה", typeKey: "lecture", startDate: "2026-11-25", time: "18:00-20:00", grades: [11], location: "אולם הספורט", description: "מפגש לתלמידים ולהורים" },
  { title: "משחקי הכדורסל הבין-כיתתיים", typeKey: "sport", startDate: "2027-02-08", endDate: "2027-02-11", grades: HIGH, location: "אולם הספורט" },
  { title: "שבוע הבריאות", typeKey: "workshop", startDate: "2027-05-30", endDate: "2027-06-03", grades: ALL },
];

const TRIPS: DemoEvent[] = [
  { title: "טיול שנתי ז' - גליל עליון", typeKey: "trip", startDate: "2026-10-27", endDate: "2026-10-28", grades: [7], description: "יציאה 07:00 מחניון בית הספר" },
  { title: "טיול שנתי ח' - ירושלים", typeKey: "trip", startDate: "2026-11-03", endDate: "2026-11-04", grades: [8] },
  { title: "טיול שנתי ט' - מדבר יהודה", typeKey: "trip", startDate: "2026-11-10", endDate: "2026-11-12", grades: [9] },
  { title: "טיול שנתי י' - הגולן", typeKey: "trip", startDate: "2027-03-02", endDate: "2027-03-04", grades: [10] },
  { title: "טיול שנתי י\"א - הנגב", typeKey: "trip", startDate: "2027-02-16", endDate: "2027-02-18", grades: [11] },
  { title: "מסע לפולין", typeKey: "trip", startDate: "2027-01-17", endDate: "2027-01-24", grades: [11] },
  { title: "סיור בכנסת", typeKey: "trip", startDate: "2027-01-05", time: "07:30-16:00", grades: [12] },
  { title: "סיור בעמק המעיינות", typeKey: "trip", startDate: "2027-05-18", time: "07:30-15:00", grades: [7] },
];

const PARENT_MEETINGS: DemoEvent[] = [
  { title: "אסיפת הורים ז'-ט'", typeKey: "parent_meeting", startDate: "2026-11-30", time: "17:00-20:00", grades: MIDDLE, location: "כיתות האם" },
  { title: "אסיפת הורים י'-י\"ב", typeKey: "parent_meeting", startDate: "2026-12-01", time: "17:00-20:00", grades: HIGH, location: "כיתות האם" },
  { title: "ערב הורים: בחירת מגמות לי'", typeKey: "parent_meeting", startDate: "2027-02-02", time: "18:30-20:30", grades: [9], location: "אולם הספורט" },
  { title: "אסיפת הורים מחצית ב' ז'-ט'", typeKey: "parent_meeting", startDate: "2027-05-03", time: "17:00-20:00", grades: MIDDLE, location: "כיתות האם" },
  { title: "אסיפת הורים מחצית ב' י'-י\"ב", typeKey: "parent_meeting", startDate: "2027-05-05", time: "17:00-20:00", grades: HIGH, location: "כיתות האם" },
];

const COUNSELING: DemoEvent[] = [
  { title: "סדנת מעבר לחטיבה", typeKey: "counseling", startDate: "2026-09-08", time: "10:00-11:30", grades: [7] },
  { title: "שיחות אישיות עם היועצת", typeKey: "counseling", startDate: "2026-12-14", endDate: "2026-12-17", grades: [9] },
  { title: "סדנת מוגנות ברשת", typeKey: "counseling", startDate: "2027-02-09", time: "09:00-10:30", grades: [7, 8] },
  { title: "הכנה לבגרויות: ניהול לחץ", typeKey: "counseling", startDate: "2027-05-06", time: "12:00-13:30", grades: [11, 12] },
  { title: "סדנת הכנה לצה\"ל", typeKey: "counseling", startDate: "2027-03-09", time: "10:00-13:00", grades: [12] },
];

const LECTURES: DemoEvent[] = [
  { title: "הרצאה: בטיחות בדרכים", typeKey: "lecture", startDate: "2026-10-14", time: "09:00-10:00", grades: [10], location: "אולם הספורט" },
  { title: "הרצאה: אוריינות פיננסית", typeKey: "lecture", startDate: "2027-01-27", time: "11:00-12:30", grades: [12] },
  { title: "סדנת רובוטיקה", typeKey: "workshop", startDate: "2026-12-02", time: "08:30-12:30", grades: [8], location: "מעבדת המחשבים" },
  { title: "סדנת כתיבה יוצרת", typeKey: "workshop", startDate: "2027-03-17", time: "10:00-12:00", grades: [9], location: "הספרייה" },
];

const SATURDAY = 6;

/** Schools don't meet on Saturday; move such a date to Sunday. */
function skipSaturday(date: string): string {
  return new Date(`${date}T12:00:00Z`).getUTCDay() === SATURDAY ? addCalendarDays(date, 1) : date;
}

/** Exams for each grade: two per half-year, plus mocks and bagrut for 10–12. */
function exams(): DemoEvent[] {
  const subjects = ["מתמטיקה", "אנגלית", "לשון", "היסטוריה", "מדעים", "תנ\"ך"];
  const windows = ["2026-11-", "2027-01-", "2027-03-", "2027-05-"];
  const list: DemoEvent[] = [];
  ALL.forEach((grade, gradeIndex) => {
    windows.forEach((prefix, windowIndex) => {
      const subject = subjects[(gradeIndex + windowIndex) % subjects.length];
      const day = String(15 + gradeIndex + (windowIndex % 2) * 2).padStart(2, "0");
      list.push({ title: `מבחן ב${subject}`, typeKey: "exam", startDate: skipSaturday(`${prefix}${day}`), time: "08:15-10:00", grades: [grade] });
    });
  });
  return [
    ...list,
    { title: "מתכונת במתמטיקה", typeKey: "exam", startDate: "2027-04-06", time: "09:00-12:00", grades: [11, 12] },
    { title: "מתכונת באנגלית", typeKey: "exam", startDate: "2027-04-08", time: "09:00-12:00", grades: [12] },
    { title: "בגרות בלשון", typeKey: "exam", startDate: "2027-01-28", time: "09:00-12:00", grades: [11] },
    { title: "בגרות באזרחות", typeKey: "exam", startDate: "2027-05-20", time: "09:00-12:00", grades: [12] },
    { title: "בגרות במתמטיקה", typeKey: "exam", startDate: "2027-06-01", time: "09:00-12:00", grades: [11, 12] },
    { title: "בגרות באנגלית", typeKey: "exam", startDate: "2027-06-07", time: "09:00-12:00", grades: [12] },
    { title: "בגרות בהיסטוריה", typeKey: "exam", startDate: "2027-06-14", time: "09:00-12:00", grades: [10] },
  ];
}

export function demoEvents(): DemoEvent[] {
  return [...HOLIDAYS, ...SCHOOL_LIFE, ...TRIPS, ...PARENT_MEETINGS, ...COUNSELING, ...LECTURES, ...exams()];
}

/** startAt/endAt for a demo event, built the same way the event form builds them. */
export function demoEventRange(event: DemoEvent): { startAt: Date; endAt: Date } {
  const [startTime, endTime] = (event.time ?? "00:00-23:59").split("-");
  const range = buildEventTimeRange({
    startDate: event.startDate,
    endDate: event.endDate,
    allDay: event.time === undefined,
    startTime,
    endTime,
  });
  return { startAt: new Date(range.startAt), endAt: new Date(range.endAt) };
}
