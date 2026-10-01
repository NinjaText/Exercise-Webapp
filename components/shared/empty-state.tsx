import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  /** Custom action node; wins over actionLabel. */
  action?: React.ReactNode;
  /** "compact" for inside cards and list bodies. */
  size?: "default" | "compact";
  className?: string;
}

/**
 * Spec §2.3: icon in a soft circle, a title, one sentence and one action.
 * "default" for page-level empties, "compact" inside cards and list bodies.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  action,
  size = "default",
  className,
}: EmptyStateProps) {
  const compact = size === "compact";

  const builtInAction =
    actionLabel && (actionHref || onAction) ? (
      actionHref ? (
        <Button asChild variant={compact ? "outline" : "default"} size={compact ? "sm" : "default"}>
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      ) : (
        <Button variant={compact ? "outline" : "default"} size={compact ? "sm" : "default"} onClick={onAction}>
          {actionLabel}
        </Button>
      )
    ) : null;

  return (
    <div
      data-slot="empty-state"
      data-size={size}
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-3 px-4 py-10" : "gap-4 px-6 py-16",
        className
      )}
    >
      <div
        data-slot="empty-state-icon"
        className={cn(
          "flex items-center justify-center rounded-full bg-surface-muted text-muted-foreground ring-1 ring-border",
          compact ? "size-10" : "size-12"
        )}
      >
        <Icon className={compact ? "size-5" : "size-6"} aria-hidden />
      </div>
      <div className="flex flex-col gap-1">
        <h3 className={cn("text-foreground", compact ? "text-label" : "text-heading")}>{title}</h3>
        {description && (
          <p className={cn("mx-auto max-w-sm text-muted-foreground", compact ? "text-caption" : "text-body")}>
            {description}
          </p>
        )}
      </div>
      {(action ?? builtInAction) && <div className={compact ? "mt-1" : "mt-2"}>{action ?? builtInAction}</div>}
    </div>
  );
}
