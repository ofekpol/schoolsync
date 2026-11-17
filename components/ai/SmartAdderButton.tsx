"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import type { EventType } from "@/lib/events/event-type";
import { SmartAdderDialog } from "./SmartAdderDialog";

interface Props {
  eventTypes: EventType[];
  allowedGrades: number[];
}

/** Dashboard entry point for the smart event adder. */
export function SmartAdderButton({ eventTypes, allowedGrades }: Props) {
  const t = useTranslations("aiAdder");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Refresh on close too: some cards may have published before others failed.
  const close = useCallback(() => {
    setOpen(false);
    router.refresh();
  }, [router]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100"
      >
        <Sparkles className="size-4" aria-hidden="true" />
        {t("open")}
      </button>
      {open && (
        <SmartAdderDialog
          open
          onClose={close}
          onPublished={close}
          eventTypes={eventTypes}
          allowedGrades={allowedGrades}
        />
      )}
    </>
  );
}
