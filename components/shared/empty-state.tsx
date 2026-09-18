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
        compact ? "gap-2 px-4 py-8" : "gap-3 px-6 py-16",
        className
      )}
    >
      <div className={cn("rounded-full bg-muted text-muted-foreground", compact ? "p-2.5" : "p-4")}>
        <Icon className={compact ? "size-5" : "size-7"} aria-hidden />
      </div>
      <div className="space-y-1">
        <h3 className={cn("font-semibold", compact ? "text-sm" : "text-base")}>{title}</h3>
        {description && (
          <p className={cn("mx-auto max-w-md text-muted-foreground", compact ? "text-xs" : "text-sm")}>
            {description}
          </p>
        )}
      </div>
      {(action ?? builtInAction) && <div className={compact ? "mt-1" : "mt-3"}>{action ?? builtInAction}</div>}
    </div>
  );
}
