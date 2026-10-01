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
   * "compact" lays the icon, label and value out on one row, uses 16px padding
   * and drops the description and trend — for dense stat strips above a table.
   * Defaults to the stacked layout.
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

  const iconBadge = (
    <div
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg",
        role ? cn(ROLE_CLASSES[role].soft, ROLE_CLASSES[role].text) : "bg-surface-muted text-muted-foreground",
      )}
    >
      <Icon className="size-4" aria-hidden />
    </div>
  );

  const linkArrow = href ? (
    <ArrowUpRight
      aria-hidden
      className="size-4 shrink-0 text-muted-foreground/50 transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-muted-foreground motion-reduce:transition-none motion-reduce:group-hover:translate-x-0 motion-reduce:group-hover:translate-y-0"
    />
  ) : null;

  // Spec §2.3: label (caption), value (tabular, title size), delta/trend chip.
  // Padding 20, compact 16 (spec §2.1).
  const card = (
    <Card
      className={cn(
        "h-full gap-0 py-0",
        interactive && "group transition-shadow hover:shadow-sm hover:ring-border-strong motion-reduce:transition-none",
        className,
      )}
    >
      <CardContent className={cn(isCompact ? "p-4" : "p-5")}>
        {isCompact ? (
          <div className="flex items-center gap-3">
            {iconBadge}
            <div className="min-w-0">
              <p className="truncate text-caption font-medium">{label}</p>
              <p className="text-title tabular-nums text-foreground">{value}</p>
            </div>
            {linkArrow && <span className="ml-auto self-start">{linkArrow}</span>}
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 pt-1.5 text-caption font-medium">{label}</p>
              <div className="flex shrink-0 items-center gap-2">
                {linkArrow}
                {iconBadge}
              </div>
            </div>
            <p className="mt-1 text-title tabular-nums text-foreground">{value}</p>
            {description && <p className="mt-1 text-caption">{description}</p>}
            {trend && (
              <div
                data-slot="stat-card-trend"
                className={cn(
                  "mt-3 inline-flex h-5.5 items-center gap-1 rounded-full px-2 text-caption font-medium tabular-nums",
                  isPositiveTrend
                    ? "bg-success-soft text-success-foreground"
                    : "bg-danger-soft text-danger-foreground",
                )}
              >
                <span aria-hidden>{isPositiveTrend ? "↑" : "↓"}</span>
                {/* The value is unsigned, so the direction must be spoken too. */}
                <span className="sr-only">{isPositiveTrend ? "Increased" : "Decreased"}</span>
                <span>
                  {Math.abs(trend.value)}% {trend.label}
                </span>
              </div>
            )}
          </>
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
