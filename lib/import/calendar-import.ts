import { buildEventTimeRange } from "@/lib/events/date-range";
import { EventQuickPublishSchema, type EventQuickPublishInput } from "@/lib/validations/events";
import { csvCell, parseCsv } from "./csv";

export const IMPORT_MAX_ROWS = 500;
const ALL_GRADES = [7, 8, 9, 10, 11, 12];

/** Template header order; the first row of an upload must match it (any column order is not supported). */
export const IMPORT_HEADERS = [
  "כותרת",
  "סוג אירוע",
  "תאריך התחלה",
  "תאריך סיום",
  "שעת התחלה",
  "שעת סיום",
  "שכבות",
  "מיקום",
  "תיאור",
] as const;

const TEMPLATE_EXAMPLES = [
  ["טיול שנתי ז'", "טיול", "27/10/2026", "28/10/2026", "", "", "ז", "גליל עליון", "יציאה 07:00"],
  ["אסיפת הורים", "אסיפת הורים", "30/11/2026", "", "17:00", "20:00", "ז,ח,ט", "כיתות האם", ""],
  ["חופשת חנוכה", "חופשה", "06/12/2026", "11/12/2026", "", "", "כל בית הספר", "", ""],
];

/** CSV the admin downloads, fills in Excel and uploads back. BOM so Excel reads Hebrew as UTF-8. */
export function importTemplateCsv(): string {
  const lines = [IMPORT_HEADERS, ...TEMPLATE_EXAMPLES].map((cells) => cells.map(csvCell).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}

export type ImportErrorCode =
  | "bad_header"
  | "too_many_rows"
  | "missing_title"
  | "unknown_type"
  | "bad_date"
  | "bad_time"
  | "bad_grades"
  | "end_before_start"
  | "invalid";

export interface ImportRow {
  /** 1-based line number in the file (the header is line 1). */
  line: number;
  title: string;
  input?: EventQuickPublishInput;
  error?: ImportErrorCode;
}

export interface ImportEventType {
  id: string;
  key: string;
  labelHe: string;
  labelEn: string;
}

export interface ImportParseResult {
  error?: ImportErrorCode;
  rows: ImportRow[];
}

/** "DD/MM/YYYY", "D.M.YYYY" or "YYYY-MM-DD" → "YYYY-MM-DD"; null when not a real date. */
export function parseImportDate(raw: string): string | null {
  const value = raw.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  const local = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(value);
  const parts = iso ? [iso[1], iso[2], iso[3]] : local ? [local[3], local[2], local[1]] : null;
  if (!parts) return null;
  const [year, month, day] = parts;
  const date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const check = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(check.getTime()) && check.toISOString().slice(0, 10) === date ? date : null;
}

/** "H:MM" / "HH:MM" → "HH:MM"; null otherwise. */
export function parseImportTime(raw: string): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

const HEBREW_GRADES: Record<string, number> = { "ז": 7, "ח": 8, "ט": 9, "י": 10, "יא": 11, "יב": 12 };
const WHOLE_SCHOOL = new Set(["", "כל בית הספר", "כולם", "הכל", "all"]);

/** "7,8" / "ז, ח" / "י\"א" / "כל בית הספר" → grade numbers; null when any part is unknown. */
export function parseImportGrades(raw: string): number[] | null {
  const value = raw.trim();
  if (WHOLE_SCHOOL.has(value.toLowerCase())) return ALL_GRADES;
  const grades = value.split(/[,;\s]+/).filter(Boolean).map((part) => {
    const letters = part.replace(/["'׳״]/g, "");
    return HEBREW_GRADES[letters] ?? (ALL_GRADES.includes(Number(letters)) ? Number(letters) : null);
  });
  if (grades.some((grade) => grade === null)) return null;
  return [...new Set(grades as number[])].sort((a, b) => a - b);
}

function findType(raw: string, types: ImportEventType[]): ImportEventType | undefined {
  const value = raw.trim().toLowerCase();
  return types.find((type) => [type.key, type.labelHe, type.labelEn].some((name) => name.toLowerCase() === value));
}

function parseRow(cells: string[], line: number, types: ImportEventType[]): ImportRow {
  const [title = "", typeName = "", start = "", end = "", startTime = "", endTime = "", grades = "", location = "", description = ""] =
    cells.map((cell) => cell.trim());
  const row = { line, title };
  if (!title) return { ...row, error: "missing_title" };
  const type = findType(typeName, types);
  if (!type) return { ...row, error: "unknown_type" };
  const startDate = parseImportDate(start);
  const endDate = end ? parseImportDate(end) : startDate;
  if (!startDate || !endDate) return { ...row, error: "bad_date" };
  const allDay = !startTime && !endTime;
  const from = allDay ? "00:00" : parseImportTime(startTime);
  const to = allDay ? "23:59" : parseImportTime(endTime || startTime);
  if (!from || !to) return { ...row, error: "bad_time" };
  const gradeList = parseImportGrades(grades);
  if (!gradeList) return { ...row, error: "bad_grades" };
  if (endDate < startDate || (!allDay && endDate === startDate && to <= from)) return { ...row, error: "end_before_start" };

  const range = buildEventTimeRange({ startDate, endDate, allDay, startTime: from, endTime: to });
  const parsed = EventQuickPublishSchema.safeParse({
    title,
    eventTypeId: type.id,
    ...range,
    allDay,
    grades: gradeList,
    ...(location ? { location } : {}),
    ...(description ? { description } : {}),
  });
  return parsed.success ? { ...row, input: parsed.data } : { ...row, error: "invalid" };
}

/** Parses an uploaded template into per-row inputs or error codes. Never throws on user data. */
export function parseCalendarImport(text: string, types: ImportEventType[]): ImportParseResult {
  const [header, ...body] = parseCsv(text);
  const headerMatches = header !== undefined && IMPORT_HEADERS.every((name, index) => header[index]?.trim() === name);
  if (!headerMatches) return { error: "bad_header", rows: [] };
  if (body.length > IMPORT_MAX_ROWS) return { error: "too_many_rows", rows: [] };
  return { rows: body.map((cells, index) => parseRow(cells, index + 2, types)) };
}
