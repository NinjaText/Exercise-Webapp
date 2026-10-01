import { cn } from "@/lib/utils";

/**
 * Body of one settings tab: a vertical stack of SettingsPanels. Width and
 * centering come from the settings layout, so header, tabs and cards align.
 */
export function SettingsPanels({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex w-full flex-col gap-6", className)}>{children}</div>;
}

interface SettingsPanelProps {
  title: string;
  description?: React.ReactNode;
  /** Footer bar of the card: usually the panel's action, right-aligned. */
  footer?: React.ReactNode;
  /** Muted text on the left of the footer, e.g. a hint about the action. */
  footerHint?: React.ReactNode;
  tone?: "default" | "danger";
  /**
   * Render children without the card, under a plain heading — for content
   * that is itself a set of cards (pricing plans).
   */
  bare?: boolean;
  id?: string;
  children: React.ReactNode;
}

/**
 * One settings group as a card: title and description in the card header,
 * fields in the body, the action in a footer bar.
 */
export function SettingsPanel({
  title,
  description,
  footer,
  footerHint,
  tone = "default",
  bare = false,
  id,
  children,
}: SettingsPanelProps) {
  const heading = (
    <div className="min-w-0">
      <h2 className={cn("text-base font-semibold tracking-tight", tone === "danger" && "text-danger-foreground")}>
        {title}
      </h2>
      {description && <div className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</div>}
    </div>
  );

  if (bare) {
    return (
      <section id={id} className="flex flex-col gap-4 pt-2">
        {heading}
        {children}
      </section>
    );
  }

  return (
    <section
      id={id}
      className={cn(
        "overflow-hidden rounded-xl bg-card shadow-xs ring-1",
        tone === "danger" ? "ring-danger-border" : "ring-border"
      )}
    >
      <div className="flex flex-col gap-6 p-5 sm:p-6">
        {heading}
        {children}
      </div>
      {(footer || footerHint) && (
        <div
          className={cn(
            "flex flex-col gap-3 border-t px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6",
            tone === "danger" ? "border-danger-border bg-danger-soft/40" : "border-border bg-muted/40"
          )}
        >
          <div className="text-sm text-muted-foreground">{footerHint}</div>
          {footer && <div className="flex shrink-0 items-center gap-2 sm:justify-end">{footer}</div>}
        </div>
      )}
    </section>
  );
}

/** A labelled row inside a panel: text on the left, a control (switch, button) on the right. */
export function SettingsRow({
  label,
  description,
  htmlFor,
  muted,
  children,
}: {
  label: string;
  description?: React.ReactNode;
  htmlFor?: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor={htmlFor} className={cn("text-sm font-medium", muted && "text-muted-foreground")}>
          {label}
        </label>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}
