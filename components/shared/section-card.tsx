import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

type LinkAction = { label: string; href: string };

export interface SectionCardProps {
  title: string;
  icon?: LucideIcon;
  count?: number;
  description?: string;
  /** One right-aligned action: a link or any node. */
  action?: LinkAction | React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  /**
   * Makes the whole card a link with the clickable hover treatment.
   * When set, a link-shaped `action` renders as a plain label because the
   * whole card is already the link (avoids an `<a>` nested in an `<a>`).
   * A custom node `action` is left to the caller — if it needs to stay
   * interactive over a linked card, give it `relative z-10`.
   */
  href?: string;
}

function isLinkAction(a: SectionCardProps["action"]): a is LinkAction {
  return (
    typeof a === "object" &&
    a !== null &&
    "href" in a &&
    "label" in a &&
    typeof (a as LinkAction).href === "string" &&
    typeof (a as LinkAction).label === "string"
  );
}

/**
 * The standard content panel: icon + title + optional count on the left,
 * one action on the right, body below. Every dashboard card and detail
 * panel uses this so headers and "View all" links match (spec §5).
 */
export function SectionCard({
  title,
  icon: Icon,
  count,
  description,
  action,
  children,
  className,
  contentClassName,
  href,
}: SectionCardProps) {
  const card = (
    <Card
      data-slot="section-card"
      className={cn(
        "gap-0 py-0 ring-1 ring-border",
        href && "transition-shadow hover:shadow-sm hover:ring-border-strong",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="flex min-w-0 items-center gap-2">
          {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
          <h2 className="truncate text-base font-semibold tracking-tight">{title}</h2>
          {typeof count === "number" && (
            <span
              data-slot="section-card-count"
              className="rounded-full bg-neutral-soft px-1.5 text-xs font-medium tabular-nums text-neutral-foreground"
            >
              {count}
            </span>
          )}
        </div>
        {action &&
          (isLinkAction(action) ? (
            href ? (
              // The whole card is already a link — a nested <a> is invalid
              // HTML, so render the same label/icon as a plain span instead.
              <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
                {action.label}
                <ArrowRight className="size-3.5" aria-hidden />
              </span>
            ) : (
              <Link
                href={action.href}
                className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                {action.label}
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            )
          ) : (
            <div className="shrink-0">{action}</div>
          ))}
      </div>
      {description && <p className="px-5 pb-3 text-sm text-muted-foreground">{description}</p>}
      <CardContent className={cn("px-5 pb-5", contentClassName)}>{children}</CardContent>
    </Card>
  );

  return href ? (
    <Link href={href} className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {card}
    </Link>
  ) : (
    card
  );
}
