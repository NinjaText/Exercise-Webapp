import Link from "next/link";
import type { CommissionKind, CommissionStatus, ReferralStatus, SubStatus } from "@prisma/client";
import { StatusBadge } from "@/components/shared/status-badge";
import type { StatusRole } from "@/lib/ui/status";
import { cn } from "@/lib/utils";

export const REFERRAL_STATUS: Record<ReferralStatus, { label: string; role: StatusRole }> = {
  SIGNED_UP: { label: "Signed up", role: "info" },
  CONVERTED: { label: "Paying", role: "success" },
  RETAINED: { label: "Retained", role: "brand" },
  CHURNED: { label: "Churned", role: "neutral" },
};

export const COMMISSION_STATUS: Record<CommissionStatus, { label: string; role: StatusRole }> = {
  UNPAID: { label: "Unpaid", role: "warning" },
  PAID: { label: "Paid", role: "success" },
  VOID: { label: "Void", role: "neutral" },
};

export const COMMISSION_KIND: Record<CommissionKind, string> = {
  SIGNUP: "Signup",
  RETENTION_BONUS: "Retention bonus",
  ADJUSTMENT: "Adjustment",
};

export const SUB_STATUS_LABEL: Record<SubStatus, string> = {
  TRIALING: "Trialing",
  ACTIVE: "Active",
  PAST_DUE: "Past due",
  CANCELED: "Canceled",
  UNPAID: "Unpaid",
};

export function ReferralStatusBadge({ status }: { status: ReferralStatus }) {
  const s = REFERRAL_STATUS[status];
  return <StatusBadge status={status.toLowerCase()} role={s.role} size="sm" label={s.label} />;
}

export function CommissionStatusBadge({ status }: { status: CommissionStatus }) {
  const s = COMMISSION_STATUS[status];
  return <StatusBadge status={status.toLowerCase()} role={s.role} size="sm" label={s.label} />;
}

export function formatDate(d: Date | null | undefined): string {
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—";
}

const TABS = [
  { key: "overview", label: "Contractors", href: "/admin/referrals" },
  { key: "plans", label: "Commission plans", href: "/admin/referrals/plans" },
  { key: "payouts", label: "Payout history", href: "/admin/referrals/payouts" },
] as const;

export function ReferralsTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <div className="flex gap-5 overflow-x-auto">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={active === t.key ? "page" : undefined}
          className={cn(
            "relative inline-flex h-10 shrink-0 items-center rounded-sm px-0.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background motion-reduce:transition-none",
            active === t.key
              ? "text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
