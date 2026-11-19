import { AppHeaderNav } from "@/components/AppHeaderNav";

export interface AppHeaderNavLink {
  href: string;
  label: string;
}

interface Props {
  title?: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
  navLinks?: AppHeaderNavLink[];
  currentPath?: string;
}

/**
 * Shared app header — title/subtitle on the start side, optional nav links
 * in the center, and an optional action slot on the end side.
 *
 * Mobile: title + action on one row, nav links on a second scrollable row.
 * Desktop: single-row layout with title | nav | action.
 */
export function AppHeader({
  title,
  subtitle,
  rightSlot,
  navLinks,
  currentPath,
}: Props) {
  const hasTitle = Boolean(title || subtitle);

  return (
    <div className="overflow-hidden border-b border-blue-100 bg-[var(--sg-surface-raised)] shadow-sm">
      {/* Primary row: title + (desktop nav) + right slot */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          {hasTitle && (
            <>
              {title && <h1 className="truncate text-base font-semibold">{title}</h1>}
              {subtitle && (
                <p className="truncate text-xs text-neutral-500">{subtitle}</p>
              )}
            </>
          )}
        </div>
        {navLinks && navLinks.length > 0 && (
          <div className="hidden sm:block">
            <AppHeaderNav links={navLinks} initialPath={currentPath} />
          </div>
        )}
        <div className="flex shrink-0 items-center gap-3">
          {rightSlot}
        </div>
      </div>
      {/* Mobile-only nav row */}
      {navLinks && navLinks.length > 0 && (
        <div className="overflow-x-auto border-t border-neutral-100 px-4 pb-2 sm:hidden">
          <AppHeaderNav links={navLinks} initialPath={currentPath} />
        </div>
      )}
    </div>
  );
}
