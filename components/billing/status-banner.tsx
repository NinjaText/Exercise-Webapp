import { AlertCircle, Clock, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const TONES = {
  danger: { box: "border-danger-border bg-danger-soft text-danger-foreground", icon: AlertCircle },
  neutral: { box: "border-neutral-border bg-neutral-soft text-neutral-foreground", icon: Clock },
  info: { box: "border-info-border bg-info-soft text-info-foreground", icon: Info },
} as const;

export type StatusBannerTone = keyof typeof TONES;

/** Billing status banner (trial days, trial ended, payment failed) on status tokens. */
export function StatusBanner({
  tone,
  children,
  action,
  className,
}: {
  tone: StatusBannerTone;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const { box, icon: Icon } = TONES[tone];
  return (
    <div
      data-slot="status-banner"
      data-tone={tone}
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 text-body", box, className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
