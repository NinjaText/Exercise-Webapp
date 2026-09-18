import { Stethoscope } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FieldInfo } from "@/components/clients/field-info";
import { SectionCard } from "@/components/shared/section-card";

/**
 * The clinical fields this card can show. Kept local and narrow so the page
 * doesn't need `any` casts against the loosely-typed Prisma profile record.
 */
export interface ClinicalProfile {
  primaryDiagnosis?: string | null;
  secondaryDiagnoses?: string[] | null;
  painScore?: number | null;
  activityLevel?: string | null;
  occupation?: string | null;
  injuryDate?: string | Date | null;
  surgeryHistory?: string | null;
  limitations?: string | null;
  comorbidities?: string | null;
  functionalChallenges?: string | null;
  priorInjuries?: string[] | null;
  fitnessGoals?: string[] | null;
  availableEquipment?: string[] | null;
  preferredDurationMinutes?: number | null;
  preferredDaysPerWeek?: number | null;
}

/**
 * True when there is at least one value worth rendering. A client can have a
 * profile ROW with every field still empty — that state now gets an explicit
 * prompt to fill it in rather than a heading over blank space.
 *
 * Deliberately excludes the session preferences: they carry database defaults
 * (25 minutes, 3 days), so counting them would make every row look populated.
 */
export function hasClinicalContent(p: ClinicalProfile | null | undefined): boolean {
  if (!p) return false;
  return Boolean(
    p.primaryDiagnosis ||
      p.secondaryDiagnoses?.length ||
      p.painScore != null ||
      p.activityLevel ||
      p.occupation ||
      p.injuryDate ||
      p.surgeryHistory ||
      p.limitations ||
      p.comorbidities ||
      p.functionalChallenges ||
      p.priorInjuries?.length ||
      p.fitnessGoals?.length ||
      p.availableEquipment?.length
  );
}

/** One label/value pair. Label column is fixed so every value starts on the same line. */
function Row({
  label,
  info,
  children,
}: {
  label: string;
  info?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-0.5 py-2.5 sm:grid-cols-[168px_1fr] sm:gap-4">
      <dt className="text-sm font-medium text-muted-foreground">
        {label}
        {info ? <FieldInfo label={label}>{info}</FieldInfo> : null}
      </dt>
      <dd className="min-w-0 text-sm text-foreground">{children}</dd>
    </div>
  );
}

/** 0–10 self-reported pain, shown as a filled scale so severity reads before the number. */
function PainScale({ score }: { score: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="flex items-center gap-1" aria-hidden="true">
        {Array.from({ length: 10 }).map((_, i) => (
          <span
            key={i}
            className={`h-2 w-2 rounded-full ${
              i < score
                ? score <= 3
                  ? "bg-success"
                  : score <= 6
                    ? "bg-warning"
                    : "bg-destructive"
                : "bg-muted-foreground/20"
            }`}
          />
        ))}
      </span>
      <span className="tabular-nums font-medium">{score}/10</span>
    </span>
  );
}

export function ClinicalProfileCard({
  profile,
  action,
}: {
  profile: ClinicalProfile | null;
  /** The Edit control, passed in so this card can stay a server component. */
  action?: React.ReactNode;
}) {
  const secondary = profile?.secondaryDiagnoses?.filter(Boolean) ?? [];
  const priorInjuries = profile?.priorInjuries?.filter(Boolean) ?? [];
  const populated = hasClinicalContent(profile);

  return (
    <SectionCard title="Clinical profile" icon={Stethoscope} action={action}>
      {!populated ? (
        <p className="text-sm text-muted-foreground">
          Nothing on file yet — this client skipped the intake questions at sign-up. Add
          what you know so it can inform their programming.
        </p>
      ) : (
        <dl className="divide-y divide-border/50">
          {profile!.primaryDiagnosis && (
            <Row
              label="Primary diagnosis"
              info="The main condition this client's programming is built around. Drives AI program generation and exercise contraindication tagging."
            >
              <span className="font-medium">{profile!.primaryDiagnosis}</span>
              {secondary.length > 0 && (
                <span className="mt-0.5 block text-muted-foreground">
                  Alongside {secondary.join(", ")}
                </span>
              )}
            </Row>
          )}

          {!profile!.primaryDiagnosis && secondary.length > 0 && (
            <Row
              label="Secondary diagnoses"
              info="Additional conditions to account for when programming. Shown to the AI generator alongside the primary diagnosis."
            >
              {secondary.join(", ")}
            </Row>
          )}

          {profile!.painScore != null && (
            <Row
              label="Pain score"
              info="Client's self-reported pain, 0 (none) to 10 (worst imaginable). Captured at intake and updated when the client logs a pain assessment."
            >
              <PainScale score={profile!.painScore} />
            </Row>
          )}

          {profile!.limitations && (
            <Row
              label="Limitations"
              info="Movements or positions this client should avoid. Review these before assigning or generating a program."
            >
              {profile!.limitations}
            </Row>
          )}

          {profile!.comorbidities && (
            <Row
              label="Comorbidities"
              info="Co-occurring conditions that affect exercise tolerance, such as cardiovascular or metabolic conditions."
            >
              {profile!.comorbidities}
            </Row>
          )}

          {profile!.activityLevel && (
            <Row
              label="Activity level"
              info="The client's baseline activity before starting this program. Used to set starting intensity."
            >
              <span className="capitalize">{profile!.activityLevel.toLowerCase()}</span>
            </Row>
          )}

          {profile!.surgeryHistory && <Row label="Surgery history">{profile!.surgeryHistory}</Row>}

          {profile!.injuryDate && (
            <Row label="Injury date">
              {new Date(profile!.injuryDate).toLocaleDateString()}
            </Row>
          )}

          {profile!.functionalChallenges && (
            <Row
              label="Functional challenges"
              info="Everyday tasks the client currently struggles with — the practical outcomes their program is working toward."
            >
              {profile!.functionalChallenges}
            </Row>
          )}

          {profile!.occupation && <Row label="Occupation">{profile!.occupation}</Row>}

          {priorInjuries.length > 0 && (
            <Row label="Prior injuries">{priorInjuries.join(", ")}</Row>
          )}

          {(profile!.fitnessGoals?.length ?? 0) > 0 && (
            <Row label="Goals">
              <span className="flex flex-wrap gap-1.5">
                {profile!.fitnessGoals!.map((g) => (
                  <Badge key={g} variant="secondary" className="font-normal">
                    {g}
                  </Badge>
                ))}
              </span>
            </Row>
          )}

          {(profile!.availableEquipment?.length ?? 0) > 0 && (
            <Row label="Equipment">
              <span className="flex flex-wrap gap-1.5">
                {profile!.availableEquipment!.map((eq) => (
                  <Badge key={eq} variant="outline" className="font-normal">
                    {eq}
                  </Badge>
                ))}
              </span>
            </Row>
          )}

          {(profile!.preferredDurationMinutes != null ||
            profile!.preferredDaysPerWeek != null) && (
            <Row
              label="Session preference"
              info="What the client said they can commit to. Used as the starting point when generating a program for them."
            >
              {[
                profile!.preferredDurationMinutes != null
                  ? `${profile!.preferredDurationMinutes} min`
                  : null,
                profile!.preferredDaysPerWeek != null
                  ? `${profile!.preferredDaysPerWeek}× / week`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Row>
          )}
        </dl>
      )}
    </SectionCard>
  );
}
