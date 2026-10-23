"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, CalendarSync, Dumbbell, Pencil, Plus, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatStripeAmount } from "@/lib/utils/money";
import { CANCELLATION_POLICY_LABELS, type CancellationPolicy } from "@/lib/payments/connect-config";
import { archiveOfferAction } from "@/actions/payment-actions";
import { OfferFormDialog, type OfferFormValues, type TemplateChoice } from "./offer-form-dialog";

export interface OfferCardData extends OfferFormValues {
  currency: string;
  isActive: boolean;
  programName: string | null;
}

interface OffersPanelProps {
  offers: OfferCardData[];
  templates: TemplateChoice[];
  /** Publishing needs a connected account with charges enabled. */
  canPublish: boolean;
}

function OfferCard({
  offer,
  onEdit,
  onArchive,
}: {
  offer: OfferCardData;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const coaching = offer.kind === "COACHING";
  const Icon = coaching ? CalendarSync : Dumbbell;
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand-foreground">
            <Icon className="size-4" aria-hidden />
          </span>
          {offer.isActive ? (
            <StatusBadge status="ACTIVE" label="Live" role="success" size="sm" />
          ) : (
            <StatusBadge status="ARCHIVED" label="Archived" role="neutral" size="sm" />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate text-label text-foreground">{offer.name}</p>
          <p className="text-heading text-foreground">
            {formatStripeAmount(offer.priceInCents, offer.currency)}
            {coaching && <span className="text-body text-muted-foreground"> / month</span>}
          </p>
          {offer.description && <p className="line-clamp-2 text-caption">{offer.description}</p>}
        </div>
        <dl className="mt-auto flex flex-col gap-1 text-caption">
          <div className="flex gap-1">
            <dt className="sr-only">Program</dt>
            <dd className="truncate">{offer.programName ? `Unlocks ${offer.programName}` : "No program attached"}</dd>
          </div>
          {coaching && (
            <div className="flex gap-1">
              <dt className="sr-only">Cancellation</dt>
              <dd>{CANCELLATION_POLICY_LABELS[offer.cancellationPolicy as CancellationPolicy] ?? offer.cancellationPolicy}</dd>
            </div>
          )}
        </dl>
        {offer.isActive && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-10 flex-1 sm:h-8" onClick={onEdit}>
              <Pencil aria-hidden />
              Edit
            </Button>
            <Button variant="ghost" size="sm" className="h-10 text-muted-foreground sm:h-8" onClick={onArchive}>
              <Archive aria-hidden />
              Archive
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function OffersPanel({ offers, templates, canPublish }: OffersPanelProps) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<OfferCardData | null>(null);
  // Bumped on every open so the form remounts with fresh values.
  const [formKey, setFormKey] = useState(0);
  const [archiving, setArchiving] = useState<OfferCardData | null>(null);

  function openForm(offer: OfferCardData | null) {
    setEditing(offer);
    setFormKey((k) => k + 1);
    setFormOpen(true);
  }

  async function confirmArchive() {
    const offer = archiving;
    setArchiving(null);
    if (!offer) return;
    const result = await archiveOfferAction(offer.id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Offer archived");
    router.refresh();
  }

  const live = offers.filter((o) => o.isActive);
  const archived = offers.filter((o) => !o.isActive);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body text-muted-foreground">
          {canPublish
            ? "Programs are a one-time purchase. Memberships bill monthly."
            : "Finish connecting Stripe to publish offers."}
        </p>
        <Button className="h-11 sm:h-9" onClick={() => openForm(null)} disabled={!canPublish}>
          <Plus aria-hidden />
          New offer
        </Button>
      </div>

      {live.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="No offers yet"
          description="Create a program or a monthly coaching membership. Your clients will see it in their Store."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {live.map((offer) => (
            <OfferCard key={offer.id} offer={offer} onEdit={() => openForm(offer)} onArchive={() => setArchiving(offer)} />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-label text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
            Archived ({archived.length})
          </summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {archived.map((offer) => (
              <OfferCard key={offer.id} offer={offer} onEdit={() => {}} onArchive={() => {}} />
            ))}
          </div>
        </details>
      )}

      <OfferFormDialog key={formKey} open={formOpen} onOpenChange={setFormOpen} templates={templates} offer={editing} />

      <ConfirmDialog
        open={archiving !== null}
        onOpenChange={(open) => !open && setArchiving(null)}
        title="Archive this offer?"
        description="Clients can no longer buy it. Existing purchases keep their access and active memberships keep billing until canceled."
        confirmLabel="Archive"
        variant="destructive"
        onConfirm={confirmArchive}
      />
    </div>
  );
}
