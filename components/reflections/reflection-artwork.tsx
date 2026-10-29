import { HelpCircle, PenLine, Quote } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { REFLECTION_KIND_LABELS, type ReflectionKind } from "@/lib/reflections/constants";

export interface ReflectionDisplay {
  kind: string;
  text: string;
  author?: string | null;
  imageUrl?: string | null;
}

const KIND_ICONS: Record<ReflectionKind, LucideIcon> = {
  QUOTE: Quote,
  QUESTION: HelpCircle,
  PROMPT: PenLine,
};

function kindMeta(kind: string): { label: string; Icon: LucideIcon } {
  const known = kind in KIND_ICONS ? (kind as ReflectionKind) : "PROMPT";
  return { label: REFLECTION_KIND_LABELS[known], Icon: KIND_ICONS[known] };
}

/**
 * The visual half of a reflection: the trainer's image (with a brand-tinted
 * scrim so the text stays legible) or a soft token gradient, plus the kind
 * label, text and attribution (centred when there's no image). Shared by
 * the client dashboard card and the trainer's preview step so both always
 * look the same.
 */
export function ReflectionArtwork({
  reflection,
  className,
  size = "default",
}: {
  reflection: ReflectionDisplay;
  className?: string;
  /** "compact" for list rows and previews in narrow columns. */
  size?: "default" | "compact";
}) {
  const { label, Icon } = kindMeta(reflection.kind);
  const hasImage = Boolean(reflection.imageUrl);
  const compact = size === "compact";
  const isQuote = reflection.kind === "QUOTE";

  return (
    <div
      className={cn(
        "relative isolate flex flex-col overflow-hidden",
        compact ? "min-h-40 p-4" : "min-h-56 p-5 sm:p-6",
        // On a photo the text sits low, under the scrim; on the plain
        // gradient there's nothing to stay clear of, so it's centred.
        hasImage
          ? "justify-end text-primary-foreground"
          : "items-center justify-center bg-[linear-gradient(140deg,var(--brand-soft),var(--info-soft))] text-center text-foreground",
        className
      )}
    >
      {hasImage && (
        <>
          {/* Plain <img>: trainer uploads served as-is from our R2 host. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={reflection.imageUrl!}
            alt=""
            className="absolute inset-0 -z-20 size-full object-cover"
            loading="lazy"
          />
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,color-mix(in_oklch,var(--primary),black_55%)_0%,color-mix(in_oklch,var(--primary),black_35%)_45%,transparent_100%)]"
          />
        </>
      )}
      {!hasImage && (
        <Icon
          aria-hidden
          className="pointer-events-none absolute -top-4 -right-4 -z-10 size-36 rotate-12 text-primary/10"
        />
      )}

      <p
        className={cn(
          "flex items-center gap-1.5 text-caption font-semibold tracking-wide uppercase",
          hasImage ? "text-primary-foreground/80" : "text-primary"
        )}
      >
        <Icon className="size-3.5" aria-hidden />
        {label}
      </p>
      <p
        className={cn(
          "mt-2 font-medium text-balance",
          compact ? "text-body" : "text-heading sm:text-title",
          isQuote && "italic"
        )}
      >
        {isQuote ? `“${reflection.text}”` : reflection.text}
      </p>
      {reflection.author && (
        <p
          className={cn(
            "mt-2 text-label",
            hasImage ? "text-primary-foreground/80" : "text-muted-foreground"
          )}
        >
          — {reflection.author}
        </p>
      )}
    </div>
  );
}
