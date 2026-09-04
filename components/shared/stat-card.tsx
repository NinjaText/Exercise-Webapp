import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
  className?: string;
  /** Overrides the default muted icon badge (e.g. "bg-blue-500/10 text-blue-600"). */
  iconClassName?: string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  description,
  trend,
  href,
  className,
  iconClassName,
}: StatCardProps) {
  const isPositiveTrend = trend
    ? trend.direction
      ? trend.direction === "up"
      : trend.value >= 0
    : false;

  const card = (
    <Card
      className={cn(
        "h-full shadow-sm ring-1 ring-border/50",
        href &&
          "group transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-border",
        className,
      )}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground", iconClassName)}>
            <Icon className="h-5 w-5" />
          </div>
          {href && (
            <ArrowUpRight className="h-4 w-4 text-muted-foreground/40 transition-all duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
          )}
        </div>
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
                  ? "bg-success/10 text-success"
                  : "bg-destructive/10 text-destructive",
              )}
            >
              <span>{isPositiveTrend ? "↑" : "↓"}</span>
              <span>
                {Math.abs(trend.value)}% {trend.label}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {card}
      </Link>
    );
  }

  return card;
}
