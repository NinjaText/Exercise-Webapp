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
  /** "compact" uses 16px padding instead of 20px (spec §2.1). */
  size?: "default" | "compact";
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
 * The standard content panel (spec §2.3): surface, hairline ring, shadow-xs,
 * rounded-xl. Header row with icon + title + optional count and description
 * on the left and one action on the right, body below. Padding 20 (compact 16).
 *
 * Padding contract: the header and the body carry their own padding (the Card
 * root is `py-0 gap-0`), so `contentClassName="px-0 pb-0"` makes the body
 * edge-to-edge for lists.
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
  size = "default",
  href,
}: SectionCardProps) {
  const compact = size === "compact";
  const actionClass = "inline-flex shrink-0 items-center gap-1 text-label text-primary";

  const card = (
    <Card
      data-slot="section-card"
      data-size={size}
      className={cn(
        "gap-0 py-0",
        href && "transition-shadow hover:shadow-sm hover:ring-border-strong motion-reduce:transition-none",
        className
      )}
    >
      <div
        data-slot="section-card-header"
        className={cn(
          "flex items-start justify-between gap-3",
          compact ? "px-4 pt-4 pb-3" : "px-5 pt-5 pb-4"
        )}
      >
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
            <h2 className="truncate text-heading text-foreground">{title}</h2>
            {typeof count === "number" && (
              <span
                data-slot="section-card-count"
                className="rounded-full bg-neutral-soft px-1.5 text-xs font-medium tabular-nums text-neutral-foreground"
              >
                {count}
              </span>
            )}
          </div>
          {description && <p className="text-body text-muted-foreground">{description}</p>}
        </div>
        {action &&
          (isLinkAction(action) ? (
            href ? (
              // The whole card is already a link — a nested <a> is invalid
              // HTML, so render the same label/icon as a plain span instead.
              <span className={actionClass}>
                {action.label}
                <ArrowRight className="size-3.5" aria-hidden />
              </span>
            ) : (
              <Link
                href={action.href}
                className={cn(
                  actionClass,
                  "rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                )}
              >
                {action.label}
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            )
          ) : (
            <div className="shrink-0">{action}</div>
          ))}
      </div>
      <CardContent className={cn(compact ? "px-4 pb-4" : "px-5 pb-5", contentClassName)}>
        {children}
      </CardContent>
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
