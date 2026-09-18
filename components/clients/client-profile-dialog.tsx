"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TagListInput } from "@/components/programs/tag-list-input";
import { ACTIVITY_LEVELS, COMMON_EQUIPMENT, FITNESS_GOALS } from "@/lib/utils/constants";
import { updateClientProfileAction } from "@/actions/client-actions";
import { cn } from "@/lib/utils";

/** The client as this dialog edits them: personal fields plus the intake record. */
export interface EditableClientProfile {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  primaryDiagnosis?: string | null;
  secondaryDiagnoses?: string[] | null;
  painScore?: number | null;
  activityLevel?: string | null;
  injuryDate?: string | Date | null;
  surgeryHistory?: string | null;
  occupation?: string | null;
  priorInjuries?: string[] | null;
  limitations?: string | null;
  comorbidities?: string | null;
  functionalChallenges?: string | null;
  availableEquipment?: string[] | null;
  fitnessGoals?: string[] | null;
  preferredDurationMinutes?: number | null;
  preferredDaysPerWeek?: number | null;
}

interface FormState {
  firstName: string;
  lastName: string;
  phone: string;
  dateOfBirth: string;
  primaryDiagnosis: string;
  secondaryDiagnoses: string[];
  painScore: string;
  activityLevel: string;
  injuryDate: string;
  surgeryHistory: string;
  occupation: string;
  priorInjuries: string[];
  limitations: string;
  comorbidities: string;
  functionalChallenges: string;
  availableEquipment: string[];
  fitnessGoals: string[];
  preferredDurationMinutes: string;
  preferredDaysPerWeek: string;
}

/** A `<input type="date">` needs `YYYY-MM-DD`; the column stores a DateTime. */
function toDateInputValue(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function toFormState(client: EditableClientProfile): FormState {
  return {
    firstName: client.firstName ?? "",
    lastName: client.lastName ?? "",
    phone: client.phone ?? "",
    dateOfBirth: client.dateOfBirth ?? "",
    primaryDiagnosis: client.primaryDiagnosis ?? "",
    secondaryDiagnoses: client.secondaryDiagnoses ?? [],
    painScore: client.painScore != null ? String(client.painScore) : "",
    activityLevel: client.activityLevel ?? "",
    injuryDate: toDateInputValue(client.injuryDate),
    surgeryHistory: client.surgeryHistory ?? "",
    occupation: client.occupation ?? "",
    priorInjuries: client.priorInjuries ?? [],
    limitations: client.limitations ?? "",
    comorbidities: client.comorbidities ?? "",
    functionalChallenges: client.functionalChallenges ?? "",
    availableEquipment: client.availableEquipment ?? [],
    fitnessGoals: client.fitnessGoals ?? [],
    preferredDurationMinutes:
      client.preferredDurationMinutes != null ? String(client.preferredDurationMinutes) : "",
    preferredDaysPerWeek:
      client.preferredDaysPerWeek != null ? String(client.preferredDaysPerWeek) : "",
  };
}

/**
 * The trainer's side of the client intake form.
 *
 * Grouped in the same order as the client's own onboarding so a trainer filling
 * gaps afterward is reading the questions in the order the client saw them.
 */
export function ClientProfileDialog({
  clientId,
  client,
  open,
  onOpenChange,
}: {
  clientId: string;
  client: EditableClientProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        {/* Mounted only while open, so each opening seeds the form from what is
            on file now rather than from whatever was typed and abandoned last
            time — no syncing effect required. */}
        {open && (
          <ProfileForm clientId={clientId} client={client} onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProfileForm({
  clientId,
  client,
  onDone,
}: {
  clientId: string;
  client: EditableClientProfile;
  onDone: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => toFormState(client));
  const [saving, setSaving] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleIn(key: "availableEquipment" | "fitnessGoals", value: string) {
    setForm((prev) => ({
      ...prev,
      [key]: prev[key].includes(value)
        ? prev[key].filter((v) => v !== value)
        : [...prev[key], value],
    }));
  }

  async function handleSave() {
    setSaving(true);
    const result = await updateClientProfileAction(clientId, {
      firstName: form.firstName,
      lastName: form.lastName,
      phone: form.phone,
      dateOfBirth: form.dateOfBirth,
      primaryDiagnosis: form.primaryDiagnosis,
      secondaryDiagnoses: form.secondaryDiagnoses,
      painScore: form.painScore === "" ? null : Number(form.painScore),
      activityLevel: form.activityLevel,
      injuryDate: form.injuryDate,
      surgeryHistory: form.surgeryHistory,
      occupation: form.occupation,
      priorInjuries: form.priorInjuries,
      limitations: form.limitations,
      comorbidities: form.comorbidities,
      functionalChallenges: form.functionalChallenges,
      availableEquipment: form.availableEquipment,
      fitnessGoals: form.fitnessGoals,
      preferredDurationMinutes:
        form.preferredDurationMinutes === "" ? null : Number(form.preferredDurationMinutes),
      preferredDaysPerWeek:
        form.preferredDaysPerWeek === "" ? null : Number(form.preferredDaysPerWeek),
    });
    setSaving(false);

    if (result.success) {
      toast.success("Client profile updated");
      onDone();
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit client profile</DialogTitle>
        <DialogDescription>
          Fill in whatever the client left blank at sign-up. This is the same record their
          onboarding writes, and it feeds AI program generation and exercise contraindications.
        </DialogDescription>
      </DialogHeader>

      <div className="min-w-0 space-y-6 py-2">
        <Section title="Personal">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" htmlFor="cp-first">
              <Input
                id="cp-first"
                value={form.firstName}
                onChange={(e) => set("firstName", e.target.value)}
              />
            </Field>
            <Field label="Last name" htmlFor="cp-last">
              <Input
                id="cp-last"
                value={form.lastName}
                onChange={(e) => set("lastName", e.target.value)}
              />
            </Field>
            <Field label="Phone" htmlFor="cp-phone">
              <Input
                id="cp-phone"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </Field>
            <Field label="Date of birth" htmlFor="cp-dob">
              <Input
                id="cp-dob"
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => set("dateOfBirth", e.target.value)}
              />
            </Field>
          </div>
        </Section>

        <Section title="Clinical">
          <Field label="Primary diagnosis" htmlFor="cp-diagnosis">
            <Input
              id="cp-diagnosis"
              value={form.primaryDiagnosis}
              onChange={(e) => set("primaryDiagnosis", e.target.value)}
              placeholder="e.g. Rotator cuff tendinopathy"
            />
          </Field>

          <Field label="Secondary diagnoses">
            <TagListInput
              values={form.secondaryDiagnoses}
              onChange={(next) => set("secondaryDiagnoses", next)}
              placeholder="Type a diagnosis and press Enter"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Pain score (0–10)" htmlFor="cp-pain">
              <Input
                id="cp-pain"
                type="number"
                min={0}
                max={10}
                value={form.painScore}
                onChange={(e) => set("painScore", e.target.value)}
              />
            </Field>
            <Field label="Activity level" htmlFor="cp-activity">
              <select
                id="cp-activity"
                value={form.activityLevel}
                onChange={(e) => set("activityLevel", e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Not recorded</option>
                {ACTIVITY_LEVELS.map((level) => (
                  <option key={level.value} value={level.value}>
                    {level.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date of injury / surgery" htmlFor="cp-injury">
              <Input
                id="cp-injury"
                type="date"
                value={form.injuryDate}
                onChange={(e) => set("injuryDate", e.target.value)}
              />
            </Field>
            <Field label="Occupation" htmlFor="cp-occupation">
              <Input
                id="cp-occupation"
                value={form.occupation}
                onChange={(e) => set("occupation", e.target.value)}
              />
            </Field>
          </div>

          <Field label="Surgery history" htmlFor="cp-surgery">
            <Textarea
              id="cp-surgery"
              rows={2}
              value={form.surgeryHistory}
              onChange={(e) => set("surgeryHistory", e.target.value)}
            />
          </Field>

          <Field label="Prior injuries">
            <TagListInput
              values={form.priorInjuries}
              onChange={(next) => set("priorInjuries", next)}
              placeholder="Type an injury and press Enter"
            />
          </Field>
        </Section>

        <Section title="Function & lifestyle">
          <Field
            label="Limitations"
            htmlFor="cp-limitations"
            hint="Movements or positions to avoid."
          >
            <Textarea
              id="cp-limitations"
              rows={2}
              value={form.limitations}
              onChange={(e) => set("limitations", e.target.value)}
            />
          </Field>
          <Field
            label="Comorbidities"
            htmlFor="cp-comorbidities"
            hint="Conditions affecting exercise tolerance."
          >
            <Textarea
              id="cp-comorbidities"
              rows={2}
              value={form.comorbidities}
              onChange={(e) => set("comorbidities", e.target.value)}
            />
          </Field>
          <Field label="Functional challenges" htmlFor="cp-functional">
            <Textarea
              id="cp-functional"
              rows={2}
              value={form.functionalChallenges}
              onChange={(e) => set("functionalChallenges", e.target.value)}
            />
          </Field>
        </Section>

        <Section title="Equipment, goals & preferences">
          <Field label="Available equipment">
            <ToggleChips
              options={[...COMMON_EQUIPMENT]}
              selected={form.availableEquipment}
              onToggle={(value) => toggleIn("availableEquipment", value)}
            />
          </Field>
          <Field label="Goals">
            <ToggleChips
              options={[...FITNESS_GOALS]}
              selected={form.fitnessGoals}
              onToggle={(value) => toggleIn("fitnessGoals", value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Preferred session length (min)" htmlFor="cp-duration">
              <Input
                id="cp-duration"
                type="number"
                min={10}
                max={90}
                value={form.preferredDurationMinutes}
                onChange={(e) => set("preferredDurationMinutes", e.target.value)}
              />
            </Field>
            <Field label="Preferred days per week" htmlFor="cp-days">
              <Input
                id="cp-days"
                type="number"
                min={1}
                max={7}
                value={form.preferredDaysPerWeek}
                onChange={(e) => set("preferredDaysPerWeek", e.target.value)}
              />
            </Field>
          </div>
        </Section>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save profile"}
        </Button>
      </DialogFooter>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ToggleChips({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const isOn = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={isOn}
            onClick={() => onToggle(option)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              isOn
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-muted"
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The card's Edit control. Split out so `ClinicalProfileCard` can stay a server
 * component and only the open/closed state crosses into the client bundle.
 */
export function ClientProfileEditButton({
  clientId,
  client,
  label = "Edit",
}: {
  clientId: string;
  client: EditableClientProfile;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="h-3.5 w-3.5" />
        {label}
      </Button>
      <ClientProfileDialog
        clientId={clientId}
        client={client}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
