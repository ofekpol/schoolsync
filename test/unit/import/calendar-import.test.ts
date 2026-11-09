import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/import/csv";
import {
  IMPORT_HEADERS,
  importTemplateCsv,
  parseCalendarImport,
  parseImportDate,
  parseImportGrades,
  parseImportTime,
} from "@/lib/import/calendar-import";

const TYPES = [
  { id: "00000000-0000-4000-8000-000000000001", key: "trip", labelHe: "טיול", labelEn: "Trip" },
  { id: "00000000-0000-4000-8000-000000000002", key: "parent_meeting", labelHe: "אסיפת הורים", labelEn: "Parent Meeting" },
  { id: "00000000-0000-4000-8000-000000000003", key: "vacation", labelHe: "חופשה", labelEn: "Vacation" },
];
const HEADER = IMPORT_HEADERS.join(",");

describe("parseCsv", () => {
  it("handles BOM, quotes, escaped quotes, CRLF and blank lines", () => {
    const rows = parseCsv('﻿a,"b, c","say ""hi"""\r\n\r\n1,2,3\n');
    expect(rows).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });

  it("keeps newlines inside quoted fields", () => {
    expect(parseCsv('"line1\nline2",x')).toEqual([["line1\nline2", "x"]]);
  });
});

describe("field parsers", () => {
  it("reads Israeli and ISO dates and rejects impossible ones", () => {
    expect(parseImportDate("27/10/2026")).toBe("2026-10-27");
    expect(parseImportDate("1.9.2026")).toBe("2026-09-01");
    expect(parseImportDate("2026-09-01")).toBe("2026-09-01");
    expect(parseImportDate("31/02/2027")).toBeNull();
    expect(parseImportDate("tomorrow")).toBeNull();
  });

  it("reads times", () => {
    expect(parseImportTime("8:30")).toBe("08:30");
    expect(parseImportTime("24:00")).toBeNull();
  });

  it("reads grades as numbers, Hebrew letters or the whole school", () => {
    expect(parseImportGrades("7, 8")).toEqual([7, 8]);
    expect(parseImportGrades("ז,ח'")).toEqual([7, 8]);
    expect(parseImportGrades('י"א, יב')).toEqual([11, 12]);
    expect(parseImportGrades("כל בית הספר")).toEqual([7, 8, 9, 10, 11, 12]);
    expect(parseImportGrades("")).toEqual([7, 8, 9, 10, 11, 12]);
    expect(parseImportGrades("13")).toBeNull();
  });
});

describe("parseCalendarImport", () => {
  it("parses the downloadable template without errors", () => {
    const result = parseCalendarImport(importTemplateCsv(), TYPES);
    expect(result.error).toBeUndefined();
    expect(result.rows).toHaveLength(3);
    expect(result.rows.every((row) => row.input && !row.error)).toBe(true);
  });

  it("builds all-day and timed ranges in Jerusalem time", () => {
    const csv = `${HEADER}\nטיול,טיול,27/10/2026,28/10/2026,,,ז,,\nאסיפה,Parent Meeting,30/11/2026,,17:00,20:00,"ז,ח",,`;
    const [trip, meeting] = parseCalendarImport(csv, TYPES).rows;
    expect(trip.input).toMatchObject({ allDay: true, grades: [7], startAt: "2026-10-27T00:00:00+02:00", endAt: "2026-10-28T23:59:59+02:00" });
    expect(meeting.input).toMatchObject({ allDay: false, grades: [7, 8], startAt: "2026-11-30T17:00:00+02:00", endAt: "2026-11-30T20:00:00+02:00" });
    expect(meeting.input?.eventTypeId).toBe(TYPES[1].id);
  });

  it("reports one error code per bad row with its file line", () => {
    const csv = [
      HEADER,
      ",טיול,27/10/2026,,,,,,",
      "x,מסיבה,27/10/2026,,,,,,",
      "x,טיול,99/99/2026,,,,,,",
      "x,טיול,27/10/2026,,25:00,,,,",
      "x,טיול,27/10/2026,,,,14,,",
      "x,טיול,28/10/2026,27/10/2026,,,,,",
    ].join("\n");
    const rows = parseCalendarImport(csv, TYPES).rows;
    expect(rows.map((row) => [row.line, row.error])).toEqual([
      [2, "missing_title"],
      [3, "unknown_type"],
      [4, "bad_date"],
      [5, "bad_time"],
      [6, "bad_grades"],
      [7, "end_before_start"],
    ]);
  });

  it("rejects a file whose header isn't the template's", () => {
    expect(parseCalendarImport("title,date\nx,1/1/2027", TYPES)).toEqual({ error: "bad_header", rows: [] });
  });

  it("rejects more than 500 rows", () => {
    const body = Array.from({ length: 501 }, () => "x,טיול,27/10/2026,,,,,,").join("\n");
    expect(parseCalendarImport(`${HEADER}\n${body}`, TYPES).error).toBe("too_many_rows");
  });
});
