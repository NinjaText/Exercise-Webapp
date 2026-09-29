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
  stripePriceId: string;
  starterProgramIds: string[];
};

type Props = {
  globalPrograms: { id: string; name: string }[];
} & ({ mode: "create" } | { mode: "edit"; clerkOrgId: string; initial: ClubFormValues });

const EMPTY: ClubFormValues = {
  name: "",
  joinSlug: "",
  joinCode: "",
  trialDays: 14,
  stripePriceId: "",
  starterProgramIds: [],
};

export function ClubForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<ClubFormValues>(props.mode === "edit" ? props.initial : EMPTY);
  const { globalPrograms } = props;

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
      const res =
        props.mode === "edit"
          ? await updateClubAction(props.clerkOrgId, values)
          : await createClubAction(values);
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
        <FormField label="Stripe price id" htmlFor="club-price" hint="Active recurring price, starts with price_." required>
          <Input id="club-price" value={values.stripePriceId} onChange={(e) => set("stripePriceId", e.target.value)} />
        </FormField>
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
