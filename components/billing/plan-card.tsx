import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

interface PlanCardProps {
  name: string;
  /** The headline price, already formatted (e.g. "$49"). */
  price?: React.ReactNode;
  /** Small text beside the price (e.g. "/ month"). */
  cadence?: string;
  /** Muted line under the price (e.g. "Billed monthly"). */
  billedNote?: string;
  /** Pill above the name (e.g. "Most popular"). */
  badge?: string;
  features?: React.ReactNode[];
  /** Emphasised plan: brand ring. */
  highlighted?: boolean;
  /** The primary CTA (and any secondary actions). */
  children?: React.ReactNode;
  /** Heading level for the plan name (default 2; use 4 under an h3). */
  headingLevel?: 2 | 3 | 4;
  className?: string;
}

/**
 * Premium pricing card (spec §2.4): plan name, large tabular price, a billing
 * note, included features with check icons, and the primary CTA slot.
 * Presentational and server-safe; CTAs are passed in as children.
 */
export function PlanCard({
  name,
  price,
  cadence,
  billedNote,
  badge,
  features,
  highlighted,
  children,
  headingLevel = 2,
  className,
}: PlanCardProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <Card
      data-slot="plan-card"
      data-highlighted={highlighted ? "true" : undefined}
      className={cn("h-full gap-5 py-6 shadow-sm", highlighted && "ring-2 ring-primary", className)}
    >
      <CardContent className="flex flex-1 flex-col gap-5">
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-3">
            <Heading className="text-heading text-foreground">{name}</Heading>
            {badge ? (
              <span className="rounded-full bg-primary px-2.5 py-0.5 text-caption font-semibold text-primary-foreground">
                {badge}
              </span>
            ) : null}
          </div>
          {price ? (
            <p className="flex items-baseline gap-1.5">
              <span className="text-display tabular-nums text-foreground">{price}</span>
              {cadence ? <span className="text-body text-muted-foreground">{cadence}</span> : null}
            </p>
          ) : null}
          {billedNote ? <p className="text-caption">{billedNote}</p> : null}
        </div>

        {features && features.length > 0 ? (
          <ul className="flex flex-col gap-2.5">
            {features.map((feature, i) => (
              <li key={i} className="flex items-start gap-2.5 text-body text-foreground">
                <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {children ? <div className="mt-auto flex flex-col gap-3">{children}</div> : null}
      </CardContent>
    </Card>
  );
}
