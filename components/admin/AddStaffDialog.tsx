"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AddStaffForm } from "@/components/admin/AddStaffForm";
import { InviteForm } from "@/components/admin/InviteForm";
import { StaffDialog } from "@/components/admin/staff-ui";

type Mode = "create" | "invite";

interface EventTypeRow {
  key: string;
  labelHe: string;
}

/**
 * The one place to bring someone onto the staff: a dialog with two ways in —
 * create the account now (temporary password), or send a sign-up link.
 */
export function AddStaffDialog({
  eventTypes,
  initialMode = "create",
  triggerLabel,
  triggerVariant = "default",
}: {
  eventTypes: EventTypeRow[];
  initialMode?: Mode;
  triggerLabel: string;
  triggerVariant?: "default" | "outline";
}) {
  const t = useTranslations("admin.staff");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(initialMode);
  const TriggerIcon = initialMode === "invite" ? Link2 : UserPlus;

  return (
    <>
      <Button
        variant={triggerVariant}
        className={cn("h-10 gap-2 px-4", triggerVariant === "default" && "sg-button-primary")}
        onClick={() => {
          setMode(initialMode);
          setOpen(true);
        }}
      >
        <TriggerIcon className="size-4" aria-hidden />
        {triggerLabel}
      </Button>
      {open && (
        <StaffDialog
          titleId={`add-staff-title-${initialMode}`}
          title={t("addStaffTitle")}
          closeLabel={t("cancel")}
          onClose={() => setOpen(false)}
        >
          <div role="radiogroup" aria-label={t("addMethod")} className="mt-5 grid gap-2 sm:grid-cols-2">
            <ModeOption
              selected={mode === "create"}
              icon={<UserPlus className="size-5" aria-hidden />}
              title={t("addModeCreate")}
              hint={t("addModeCreateHint")}
              onSelect={() => setMode("create")}
            />
            <ModeOption
              selected={mode === "invite"}
              icon={<Link2 className="size-5" aria-hidden />}
              title={t("addModeInvite")}
              hint={t("addModeInviteHint")}
              onSelect={() => setMode("invite")}
            />
          </div>
          <div className="mt-6">
            {mode === "create" ? (
              <AddStaffForm eventTypes={eventTypes} />
            ) : (
              <InviteForm eventTypes={eventTypes} />
            )}
          </div>
        </StaffDialog>
      )}
    </>
  );
}

function ModeOption({
  selected,
  icon,
  title,
  hint,
  onSelect,
}: {
  selected: boolean;
  icon: ReactNode;
  title: string;
  hint: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3 text-start transition-colors",
        selected
          ? "border-violet-400 bg-violet-50 ring-1 ring-violet-400"
          : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50",
      )}
    >
      <span className={cn("mt-0.5", selected ? "text-violet-700" : "text-neutral-500")}>{icon}</span>
      <span>
        <span className="block text-sm font-semibold text-neutral-950">{title}</span>
        <span className="block text-xs text-neutral-600">{hint}</span>
      </span>
    </button>
  );
}
