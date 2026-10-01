"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ListOrdered, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/shared/form-section";
import { SectionCard } from "@/components/shared/section-card";
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

/** An input with a fixed prefix and/or suffix, styled like the plain Input. */
function AffixInput({
  prefix,
  suffix,
  ...props
}: { prefix?: string; suffix?: string } & React.ComponentProps<"input">) {
  return (
    <InputGroup className="rounded-md bg-surface shadow-xs hover:border-border-strong">
      {prefix && (
        <InputGroupAddon>
          <InputGroupText>{prefix}</InputGroupText>
        </InputGroupAddon>
      )}
      <InputGroupInput {...props} />
      {suffix && (
        <InputGroupAddon align="inline-end">
          <InputGroupText>{suffix}</InputGroupText>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}

export function ClubForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const initial = props.mode === "edit" ? props.initial : EMPTY;
  const [values, setValues] = useState<ClubFormValues>(initial);
  const { globalPrograms } = props;
  const notes: ClubPriceNotes = props.mode === "edit" ? (props.priceNotes ?? {}) : {};
  const dirty = props.mode === "edit" && JSON.stringify(values) !== JSON.stringify(initial);

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
    <form onSubmit={submit} className="flex flex-col gap-6">
      <SectionCard title="Club details" description="How members find and join the club.">
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Name" htmlFor="club-name" className="sm:col-span-2" required>
            <Input id="club-name" value={values.name} onChange={(e) => set("name", e.target.value)} maxLength={120} />
          </FormField>
          <FormField label="Join link" htmlFor="club-slug" hint="Lowercase letters, numbers and dashes." required>
            <AffixInput
              id="club-slug"
              prefix="/join/"
              value={values.joinSlug}
              onChange={(e) => set("joinSlug", e.target.value)}
              maxLength={60}
            />
          </FormField>
          <FormField label="Access code" htmlFor="club-code" hint="Members type this on the join page." required>
            <Input
              id="club-code"
              value={values.joinCode}
              onChange={(e) => set("joinCode", e.target.value)}
              maxLength={32}
              className="tracking-wide"
            />
          </FormField>
        </div>
      </SectionCard>

      <SectionCard title="Trial and pricing" description="Prices are in USD. We create the Stripe prices for you.">
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            label="Membership price"
            htmlFor="club-membership-amount"
            hint={notes.membership ?? "Charged monthly after the trial. $1 to $10,000."}
            required={!notes.membership}
          >
            <AffixInput
              id="club-membership-amount"
              prefix="$"
              suffix="/ month"
              inputMode="decimal"
              placeholder="14.99"
              value={values.membershipAmount}
              onChange={(e) => set("membershipAmount", e.target.value)}
            />
          </FormField>
          <FormField
            label="Coaching price"
            htmlFor="club-coaching-amount"
            hint={notes.coaching ?? "Optional paid add-on. Leave empty to not offer coaching."}
          >
            <AffixInput
              id="club-coaching-amount"
              prefix="$"
              suffix="/ month"
              inputMode="decimal"
              placeholder="30.00"
              value={values.coachingAmount}
              onChange={(e) => set("coachingAmount", e.target.value)}
            />
          </FormField>
          <FormField label="Free trial" htmlFor="club-trial" hint="Days before the first charge." required>
            <AffixInput
              id="club-trial"
              type="number"
              suffix="days"
              min={1}
              max={365}
              value={values.trialDays}
              onChange={(e) => set("trialDays", Number(e.target.value))}
            />
          </FormField>
        </div>
      </SectionCard>

      {props.mode === "create" && (
        <SectionCard title="Club trainer" description="The person who runs the club day to day.">
          <FormField
            label="Trainer email"
            htmlFor="club-trainer-email"
            hint="We'll invite them to run the club. It needs a dedicated account: the email can't already be in use."
            required
          >
            <Input
              id="club-trainer-email"
              type="email"
              placeholder="trainer@club.com"
              value={values.trainerEmail}
              onChange={(e) => set("trainerEmail", e.target.value)}
            />
          </FormField>
        </SectionCard>
      )}

      <SectionCard
        title="Starter programs"
        count={values.starterProgramIds.length}
        description="Members receive these in order, one after another. Scheduled programs only."
      >
        <div className="flex flex-col gap-3">
          {values.starterProgramIds.length > 0 ? (
            <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {values.starterProgramIds.map((id, i) => (
                <li key={id} className="flex items-center gap-3 bg-surface py-2 pr-2 pl-3">
                  <span
                    aria-hidden
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-neutral-soft text-caption font-medium tabular-nums text-neutral-foreground"
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-body text-foreground">{nameOf(id)}</span>
                  <div className="flex shrink-0 items-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Move up"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Move down"
                      disabled={i === values.starterProgramIds.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove"
                      className="text-muted-foreground hover:text-danger-foreground"
                      onClick={() => set("starterProgramIds", values.starterProgramIds.filter((x) => x !== id))}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-border px-4 py-5">
              <ListOrdered className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <p className="text-body text-muted-foreground">No starter programs yet. Add one below.</p>
            </div>
          )}
          <Select
            value={null}
            onValueChange={(v) => v && set("starterProgramIds", [...values.starterProgramIds, v as string])}
            disabled={available.length === 0}
          >
            <SelectTrigger aria-label="Add starter program">
              <SelectValue>
                {() => (available.length === 0 ? "No more programs to add" : "Add a program…")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {available.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </SectionCard>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        {dirty && <p className="text-caption sm:mr-auto">You have unsaved changes.</p>}
        {dirty && (
          <Button type="button" variant="outline" disabled={pending} onClick={() => setValues(initial)}>
            Discard
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : props.mode === "edit" ? "Save changes" : "Create club"}
        </Button>
      </div>
    </form>
  );
}
