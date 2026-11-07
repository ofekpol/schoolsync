"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { jerusalemDateString, jerusalemTimeString } from "@/lib/datetime";

interface PreviewRow {
  line: number;
  title: string;
  error: string | null;
  startAt: string | null;
  endAt: string | null;
  allDay: boolean;
  grades: number[];
  eventTypeId: string | null;
}

interface ImportResponse {
  error: string | null;
  rows: PreviewRow[];
  imported: number;
}

interface CalendarImportProps {
  template: string;
  typeLabels: Record<string, string>;
  /** Called after a confirmed import publishes events. */
  onImported?: (count: number) => void;
}

type Status = "idle" | "loading" | "previewed" | "imported" | "failed";

export function CalendarImport({ template, typeLabels, onImported }: CalendarImportProps) {
  const t = useTranslations("admin.import");
  const [csv, setCsv] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  async function send(text: string, commit: boolean) {
    setStatus("loading");
    try {
      const res = await fetch("/api/v1/admin/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv: text, commit }),
      });
      if (!res.ok && res.status !== 201) throw new Error(String(res.status));
      const body = (await res.json()) as ImportResponse;
      setResult(body);
      setStatus(body.imported > 0 ? "imported" : "previewed");
      if (body.imported > 0) onImported?.(body.imported);
    } catch {
      setStatus("failed");
    }
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsv(text);
    await send(text, false);
  }

  const errorCount = result?.rows.filter((row) => row.error).length ?? 0;
  const canImport = status === "previewed" && result !== null && !result.error && errorCount === 0 && result.rows.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(template)}`}
          download={t("templateFile")}
          className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          <Download aria-hidden className="size-4" />
          {t("download")}
        </a>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent focus-within:ring-2 focus-within:ring-ring">
          <Upload aria-hidden className="size-4" />
          {t("upload")}
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={handleFile} />
        </label>
      </div>
      <ImportStatus status={status} result={result} errorCount={errorCount} />
      {canImport && csv && (
        <Button onClick={() => send(csv, true)}>{t("confirm", { count: result.rows.length })}</Button>
      )}
      {result && result.rows.length > 0 && <PreviewTable rows={result.rows} typeLabels={typeLabels} />}
    </div>
  );
}

function ImportStatus({ status, result, errorCount }: { status: Status; result: ImportResponse | null; errorCount: number }) {
  const t = useTranslations("admin.import");
  if (status === "loading") return <p role="status" className="text-sm">{t("loading")}</p>;
  if (status === "failed") return <p role="alert" className="text-sm text-destructive">{t("failed")}</p>;
  if (status === "imported" && result) return <p role="status" className="text-sm text-green-700">{t("imported", { count: result.imported })}</p>;
  if (status !== "previewed" || !result) return null;
  if (result.error) return <p role="alert" className="text-sm text-destructive">{t(`errors.${result.error}`)}</p>;
  if (result.rows.length === 0) return <p role="alert" className="text-sm text-destructive">{t("empty")}</p>;
  if (errorCount > 0) return <p role="alert" className="text-sm text-destructive">{t("hasErrors", { count: errorCount })}</p>;
  return <p role="status" className="text-sm">{t("ready", { count: result.rows.length })}</p>;
}

function PreviewTable({ rows, typeLabels }: { rows: PreviewRow[]; typeLabels: Record<string, string> }) {
  const t = useTranslations("admin.import");
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted text-start">
          <tr>
            {["line", "eventTitle", "type", "when", "grades", "status"].map((key) => (
              <th key={key} scope="col" className="px-3 py-2 text-start font-medium">{t(`columns.${key}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.line} className={row.error ? "bg-destructive/10" : "border-t"}>
              <td className="px-3 py-2">{row.line}</td>
              <td className="px-3 py-2">{row.title}</td>
              <td className="px-3 py-2">{row.eventTypeId ? typeLabels[row.eventTypeId] : ""}</td>
              <td className="px-3 py-2" dir="ltr">{formatWhen(row)}</td>
              <td className="px-3 py-2">{row.grades.join(", ")}</td>
              <td className="px-3 py-2">{row.error ? t(`errors.${row.error}`) : t("ok")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatWhen(row: PreviewRow): string {
  if (!row.startAt || !row.endAt) return "";
  const start = new Date(row.startAt);
  const end = new Date(row.endAt);
  const days = jerusalemDateString(start) === jerusalemDateString(end)
    ? jerusalemDateString(start)
    : `${jerusalemDateString(start)} – ${jerusalemDateString(end)}`;
  return row.allDay ? days : `${days} ${jerusalemTimeString(start)}–${jerusalemTimeString(end)}`;
}
