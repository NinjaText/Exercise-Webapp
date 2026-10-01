import Link from "next/link";

/** Shown to club members during their free trial (platform layout). */
export function MemberTrialBanner({ daysLeft }: { daysLeft: number }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-info-border bg-info-soft px-4 py-3 text-sm text-info-foreground">
      <span>
        {daysLeft} day{daysLeft === 1 ? "" : "s"} left in your free trial.
      </span>
      <Link href="/billing" className="shrink-0 font-medium underline underline-offset-2 hover:opacity-80">
        Subscribe
      </Link>
    </div>
  );
}
