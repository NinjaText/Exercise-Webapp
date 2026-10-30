import Link from "next/link";
import Image from "next/image";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Building blocks for the public marketing pages (/, /clubs, /professionals,
 * /individuals). Warm cream palette from the `cream/sand/clay/ink` tokens in
 * globals.css.
 */

export const SIGN_UP_HREF = "/sign-up";
export const DEMO_HREF = "mailto:hello@miaperformance.com?subject=MIA%20Performance%20demo";

export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-10", className)}>{children}</div>;
}

export function Eyebrow({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <p className={cn("text-[11px] font-medium tracking-[0.22em] text-ink-soft uppercase sm:text-xs", className)}>
      {children}
    </p>
  );
}

export function PillLink({
  href,
  variant = "dark",
  arrow = true,
  className,
  children,
}: {
  href: string;
  variant?: "dark" | "light";
  arrow?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const external = href.startsWith("mailto:");
  const classes = cn(
    "inline-flex h-11 items-center justify-center gap-2.5 rounded-full px-6 text-sm font-medium transition-colors sm:h-12 sm:px-7",
    variant === "dark"
      ? "bg-ink text-cream shadow-sm hover:bg-ink/90"
      : "border border-sand-line bg-white/70 text-ink backdrop-blur hover:bg-white",
    className,
  );
  const content = (
    <>
      {children}
      {arrow && <ArrowRight className="h-4 w-4" aria-hidden />}
    </>
  );
  return external ? (
    <a href={href} className={classes}>
      {content}
    </a>
  ) : (
    <Link href={href} className={classes}>
      {content}
    </Link>
  );
}

export function IconTile({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sand/70 text-ink sm:h-11 sm:w-11",
        className,
      )}
    >
      <Icon className="h-5 w-5" strokeWidth={1.6} aria-hidden />
    </span>
  );
}

/** Large display heading used for hero and section titles. */
export function DisplayHeading({
  as: Tag = "h2",
  className,
  children,
}: {
  as?: "h1" | "h2";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tag
      className={cn(
        "font-normal tracking-[-0.03em] text-ink",
        Tag === "h1"
          ? "text-[2.6rem] leading-[1.02] sm:text-6xl lg:text-[3.5rem] xl:text-[3.875rem]"
          : "text-3xl leading-[1.08] sm:text-4xl lg:text-[2.75rem]",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/**
 * Hero band: copy on the left, a framed photo on the right. The frame starts
 * below the fixed nav and keeps the container's gutters, so the photo never
 * runs under the menu or off the edge. On phones the photo stacks under the copy.
 */
export function PhotoBand({
  src,
  alt,
  priority,
  className,
  imageClassName,
  children,
}: {
  src: string;
  alt: string;
  priority?: boolean;
  className?: string;
  imageClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("bg-cream pt-24 pb-14 sm:pt-28 sm:pb-16 lg:pt-32 lg:pb-20", className)}>
      <Container className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)] lg:gap-12">
        <div className="max-w-xl lg:py-6">{children}</div>
        <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-sand-line bg-cream-deep shadow-[0_24px_60px_-28px_rgba(60,40,20,0.35)] lg:aspect-[11/10]">
          <Image
            src={src}
            alt={alt}
            fill
            priority={priority}
            sizes="(min-width: 1024px) 50vw, 100vw"
            className={cn("object-cover", imageClassName)}
          />
        </div>
      </Container>
    </section>
  );
}

/** Icon + two-line label used in hero highlight rows. */
export function HeroHighlight({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-6 w-6 shrink-0 text-ink sm:h-7 sm:w-7" strokeWidth={1.4} aria-hidden />
      <span className="text-sm leading-snug text-ink-soft">{children}</span>
    </div>
  );
}

export function FeatureCard({
  icon,
  title,
  description,
  layout = "stacked",
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  /** "stacked" puts the icon above the title; "inline" puts it beside. */
  layout?: "stacked" | "inline";
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border border-sand-line bg-white/60 p-5 shadow-[0_1px_2px_rgba(60,40,20,0.04)] backdrop-blur sm:p-6",
        className,
      )}
    >
      <div className={cn(layout === "inline" ? "flex gap-4" : "space-y-4")}>
        <IconTile icon={icon} />
        <div className={cn(layout === "inline" && "pt-2.5")}>
          <h3 className="text-base font-medium tracking-[-0.01em] text-ink sm:text-[17px]">{title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{description}</p>
        </div>
      </div>
      {children && <div className="mt-5 flex flex-1 flex-col justify-end">{children}</div>}
    </div>
  );
}

/** Closing call-to-action band with a photo on the right. */
export function CtaBand({
  eyebrow,
  title,
  body,
  src,
  alt,
  actions,
  aside,
}: {
  eyebrow: string;
  title: string;
  body: string;
  src: string;
  alt: string;
  actions: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden bg-cream-deep">
      <div className="absolute inset-y-0 right-0 hidden w-[60%] md:block">
        <Image src={src} alt={alt} fill sizes="60vw" className="object-cover" />
        <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-cream-deep to-transparent" />
      </div>
      <Container className="relative grid items-center gap-10 py-14 sm:py-20 md:grid-cols-2">
        <div>
          <Eyebrow>{eyebrow}</Eyebrow>
          <DisplayHeading className="mt-3">{title}</DisplayHeading>
          <p className="mt-4 max-w-md text-base leading-relaxed text-ink-soft">{body}</p>
          <div className="mt-7 flex flex-wrap gap-3">{actions}</div>
        </div>
        {aside && <div className="hidden justify-end md:flex">{aside}</div>}
      </Container>
    </section>
  );
}
