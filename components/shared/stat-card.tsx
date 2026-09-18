import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ROLE_CLASSES, type StatusRole } from "@/lib/ui/status";

interface StatCardTrend {
  value: number;
  label: string;
  direction?: "up" | "down";
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  trend?: StatCardTrend;
  href?: string;
  /** Forwarded to `next/link`'s `scroll` prop when `href` is set. Defaults to `true`. */
  scroll?: boolean;
  /**
   * Renders the card as a `<button>` instead of a link when no `href` is set
   * (`href` wins if both are provided). This component has no `"use client"`
   * directive, so only client component callers can pass a function here —
   * a server page cannot pass `onClick`, which is fine.
   */
  onClick?: () => void;
  className?: string;
  /** Semantic color for the icon badge. Omit for neutral grey. */
  role?: StatusRole;
  /**
   * "compact" lays the icon and value out on one row, tightens the padding and
   * drops the description sub-line — for dense stat strips above a table.
   * Defaults to the original stacked layout.
   */
  size?: "default" | "compact";
}

export function StatCard({
  label,
  value,
  icon: Icon,
  description,
  trend,
  href,
  scroll = true,
  onClick,
  className,
  role,
  size = "default",
}: StatCardProps) {
  const isCompact = size === "compact";
  const interactive = Boolean(href || onClick);
  const isPositiveTrend = trend
    ? trend.direction
      ? trend.direction === "up"
      : trend.value >= 0
    : false;

  const card = (
    <Card
      className={cn(
        "h-full ring-1 ring-border shadow-none",
        interactive && "group transition-shadow hover:shadow-sm hover:ring-border-strong",
        className,
      )}
    >
      <CardContent className={cn(isCompact ? "p-3" : "p-4 sm:p-6")}>
        <div className={cn(isCompact ? "flex items-center gap-3" : "flex items-start justify-between")}>
          <div
            className={cn(
              "flex shrink-0 items-center justify-center rounded-xl",
              isCompact ? "h-8 w-8 rounded-lg" : "h-11 w-11",
              role ? cn(ROLE_CLASSES[role].soft, ROLE_CLASSES[role].text) : "bg-muted text-muted-foreground",
            )}
          >
            <Icon className={cn(isCompact ? "h-4 w-4" : "h-5 w-5")} />
          </div>
          {isCompact && (
            <div className="min-w-0">
              <p className="text-xl font-bold leading-tight tabular-nums">{value}</p>
              <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
            </div>
          )}
          {href && (
            <ArrowUpRight
              className={cn(
                "h-4 w-4 text-muted-foreground/40 transition-all duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-muted-foreground",
                isCompact && "ml-auto",
              )}
            />
          )}
        </div>
        {!isCompact && (
          <div className="mt-4">
            <p className="text-3xl font-bold tabular-nums">{value}</p>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            {description && (
              <p className="mt-1 text-xs text-muted-foreground/70">{description}</p>
            )}
            {trend && (
              <div
                className={cn(
                  "mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                  isPositiveTrend
                    ? "bg-success-soft text-success-foreground"
                    : "bg-danger-soft text-danger-foreground",
                )}
              >
                <span>{isPositiveTrend ? "↑" : "↓"}</span>
                <span>
                  {Math.abs(trend.value)}% {trend.label}
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link
        href={href}
        scroll={scroll}
        className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {card}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="block w-full rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {card}
      </button>
    );
  }

  return card;
}
