"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormSection, FormField } from "@/components/shared/form-section";
import { createClubAction, updateClubAction } from "@/actions/admin-club-actions";

export type ClubFormValues = {
  name: string;
  joinSlug: string;
  joinCode: string;
  trialDays: number;
  /** USD per month, e.g. "14.99". We create the Stripe price. */
  membershipAmount: string;
  /** USD per month; empty = coaching not offered (unless `priceNotes.coaching` is set, then empty = keep). */
  coachingAmount: string;
  starterProgramIds: string[];
  /** Create only; the edit form never sends it. */
  trainerEmail: string;
};

/**
 * Edit only: set for a price the form couldn't pre-fill (Stripe unreadable,
 * or not a USD monthly price). That field starts empty, and empty then means
 * "keep the current price", never "remove".
 */
export type ClubPriceNotes = { membership?: string; coaching?: string };

type Props = {
  globalPrograms: { id: string; name: string }[];
} & (
  | { mode: "create" }
  | { mode: "edit"; clerkOrgId: string; initial: ClubFormValues; priceNotes?: ClubPriceNotes }
);

/** What the actions receive: the form values plus keep flags. */
export function clubFormPayload(values: ClubFormValues, notes: ClubPriceNotes) {
  return {
    ...values,
    keepMembershipPrice: Boolean(notes.membership) && !values.membershipAmount.trim(),
    keepCoachingPrice: Boolean(notes.coaching) && !values.coachingAmount.trim(),
  };
}

const EMPTY: ClubFormValues = {
  name: "",
  joinSlug: "",
  joinCode: "",
  trialDays: 14,
  membershipAmount: "",
  coachingAmount: "",
  starterProgramIds: [],
  trainerEmail: "",
};

export function ClubForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<ClubFormValues>(props.mode === "edit" ? props.initial : EMPTY);
  const { globalPrograms } = props;
  const notes: ClubPriceNotes = props.mode === "edit" ? (props.priceNotes ?? {}) : {};

  const set = <K extends keyof ClubFormValues>(key: K, v: ClubFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: v }));

  const nameOf = (id: string) => globalPrograms.find((p) => p.id === id)?.name ?? id;
  const available = globalPrograms.filter((p) => !values.starterProgramIds.includes(p.id));

  const move = (index: number, delta: -1 | 1) => {
    const next = [...values.starterProgramIds];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    set("starterProgramIds", next);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const payload = clubFormPayload(values, notes);
      const res =
        props.mode === "edit"
          ? await updateClubAction(props.clerkOrgId, payload)
          : await createClubAction(payload);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(props.mode === "edit" ? "Club updated" : "Club created");
      if (props.mode === "create" && "clerkOrgId" in res) router.push(`/admin/clubs/${res.clerkOrgId}`);
      else router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-8">
      <FormSection title="Club details">
        <FormField label="Name" htmlFor="club-name" required>
          <Input id="club-name" value={values.name} onChange={(e) => set("name", e.target.value)} maxLength={120} />
        </FormField>
        <FormField
          label="Join slug"
          htmlFor="club-slug"
          hint={`Link: /join/${values.joinSlug || "{slug}"}`}
          required
        >
          <Input id="club-slug" value={values.joinSlug} onChange={(e) => set("joinSlug", e.target.value)} maxLength={60} />
        </FormField>
        <FormField label="Access code" htmlFor="club-code" hint="Members type this on the join page." required>
          <Input id="club-code" value={values.joinCode} onChange={(e) => set("joinCode", e.target.value)} maxLength={32} />
        </FormField>
        <FormField label="Trial days" htmlFor="club-trial" required>
          <Input
            id="club-trial"
            type="number"
            min={1}
            max={365}
            value={values.trialDays}
            onChange={(e) => set("trialDays", Number(e.target.value))}
          />
        </FormField>
        <FormField
          label="Membership price ($/month)"
          htmlFor="club-membership-amount"
          hint={notes.membership ?? "USD, charged monthly after the trial. $1 to $10,000."}
          required={!notes.membership}
        >
          <Input
            id="club-membership-amount"
            inputMode="decimal"
            placeholder="14.99"
            value={values.membershipAmount}
            onChange={(e) => set("membershipAmount", e.target.value)}
          />
        </FormField>
        <FormField
          label="Coaching price ($/month)"
          htmlFor="club-coaching-amount"
          hint={notes.coaching ?? "Optional paid coaching add-on, USD monthly. Leave empty to not offer coaching."}
        >
          <Input
            id="club-coaching-amount"
            inputMode="decimal"
            placeholder="30"
            value={values.coachingAmount}
            onChange={(e) => set("coachingAmount", e.target.value)}
          />
        </FormField>
        {props.mode === "create" && (
          <FormField
            label="Club trainer email"
            htmlFor="club-trainer-email"
            hint="We'll invite them to run the club. It needs a dedicated account: the email can't already be in use."
            required
          >
            <Input
              id="club-trainer-email"
              type="email"
              value={values.trainerEmail}
              onChange={(e) => set("trainerEmail", e.target.value)}
            />
          </FormField>
        )}
      </FormSection>

      <FormSection
        title="Starter programs"
        description="Members receive these in order, one after another. Scheduled global programs only."
      >
        {values.starterProgramIds.length > 0 && (
          <ol className="flex flex-col gap-2">
            {values.starterProgramIds.map((id, i) => (
              <li key={id} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                <span className="w-5 text-xs text-muted-foreground">{i + 1}.</span>
                <span className="flex-1 truncate text-sm">{nameOf(id)}</span>
                <Button type="button" variant="ghost" size="icon" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Move down"
                  disabled={i === values.starterProgramIds.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove"
                  onClick={() => set("starterProgramIds", values.starterProgramIds.filter((x) => x !== id))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ol>
        )}
        <select
          aria-label="Add starter program"
          value=""
          onChange={(e) => e.target.value && set("starterProgramIds", [...values.starterProgramIds, e.target.value])}
          disabled={available.length === 0}
          className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
        >
          <option value="">{available.length === 0 ? "No more programs to add" : "Add a program…"}</option>
          {available.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </FormSection>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : props.mode === "edit" ? "Save changes" : "Create club"}
        </Button>
      </div>
    </form>
  );
}
