import { Plus } from "lucide-react";
import { requireSuperAdmin } from "@/lib/current-user";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { listPlans } from "@/lib/referrals/admin";
import { describeCommission, describeRetention } from "@/lib/referrals/terms";
import { ReferralsTabs, formatDate } from "../ui";
import { PlanDialog } from "./plan-dialog";
import { ArchivePlanButton } from "./archive-plan-button";

export const metadata = { title: "Commission plans — Referrals" };

export default async function CommissionPlansPage() {
  await requireSuperAdmin();
  const plans = await listPlans();
  const active = plans.filter((p) => !p.archivedAt);
  const archived = plans.filter((p) => p.archivedAt);

  const card = (p: (typeof plans)[number]) => (
    <article key={p.id} className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-foreground">{p.name}</h3>
          <p className="text-caption">
            {p.contractorCount} contractor{p.contractorCount === 1 ? "" : "s"} · updated {formatDate(p.updatedAt)}
          </p>
        </div>
        {p.archivedAt && <StatusBadge status="archived" role="neutral" size="sm" label="Archived" />}
      </div>
      <dl className="grid gap-2 text-body">
        <div>
          <dt className="text-caption">Trainers</dt>
          <dd className="text-foreground">{describeCommission(p.trainerCommissionType, p.trainerCommissionValue)}</dd>
        </div>
        <div>
          <dt className="text-caption">Individuals</dt>
          <dd className="text-foreground">{describeCommission(p.individualCommissionType, p.individualCommissionValue)}</dd>
        </div>
        <div>
          <dt className="text-caption">Retention</dt>
          <dd className="text-foreground">{describeRetention(p)}</dd>
        </div>
      </dl>
      {p.description && <p className="text-caption whitespace-pre-line">{p.description}</p>}
      <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-4">
        <PlanDialog plan={p} inUseBy={p.contractorCount} trigger={<Button variant="outline" size="sm">Edit</Button>} />
        <ArchivePlanButton planId={p.id} archived={Boolean(p.archivedAt)} name={p.name} inUseBy={p.contractorCount} />
      </div>
    </article>
  );

  return (
    <PageShell>
      <PageHeader
        title="Referrals"
        breadcrumb={[
          { label: "Admin", href: "/admin" },
          { label: "Referrals", href: "/admin/referrals" },
          { label: "Commission plans" },
        ]}
        description="Reusable compensation terms. Assign a plan to each contractor; give someone different terms by creating a plan just for them."
        primaryAction={
          <PlanDialog
            trigger={
              <Button>
                <Plus className="size-4" aria-hidden />
                New plan
              </Button>
            }
          />
        }
        tabs={<ReferralsTabs active="plans" />}
      />

      <p className="rounded-lg border border-border bg-muted/40 p-3 text-body text-muted-foreground">
        Editing a plan only changes <span className="font-medium text-foreground">future</span> referrals. Each referral keeps
        the terms it signed up under, and commissions already earned are never recalculated.
      </p>

      {active.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="font-medium text-foreground">No commission plans yet</p>
          <p className="mt-1 text-body text-muted-foreground">
            Example: $50 per paying trainer, 20% of an individual&apos;s first payment, and $200 for every 4 trainers retained 2
            months.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{active.map(card)}</div>
      )}

      {archived.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Archived</h2>
          <p className="text-caption">
            Archived plans can&apos;t be assigned to new contractors. Contractors already on one keep earning under it.
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{archived.map(card)}</div>
        </section>
      )}
    </PageShell>
  );
}
