import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FieldInfo } from "@/components/clients/field-info";

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
  fitnessGoals?: string[] | null;
  availableEquipment?: string[] | null;
}

/**
 * True when there is at least one value worth rendering. A client can have a
 * profile ROW with every field still empty — rendering the card then produced a
 * heading with nothing under it.
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
                    ? "bg-amber-500"
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

export function ClinicalProfileCard({ profile }: { profile: ClinicalProfile }) {
  const secondary = profile.secondaryDiagnoses?.filter(Boolean) ?? [];

  return (
    <Card className="shadow-sm ring-1 ring-border/50">
      <CardContent className="p-4 sm:p-6">
        <h2 className="text-base font-semibold">Clinical profile</h2>
        <dl className="mt-1 divide-y divide-border/50">
          {profile.primaryDiagnosis && (
            <Row
              label="Primary diagnosis"
              info="The main condition this client's programming is built around. Drives AI program generation and exercise contraindication tagging."
            >
              <span className="font-medium">{profile.primaryDiagnosis}</span>
              {secondary.length > 0 && (
                <span className="mt-0.5 block text-muted-foreground">
                  Alongside {secondary.join(", ")}
                </span>
              )}
            </Row>
          )}

          {!profile.primaryDiagnosis && secondary.length > 0 && (
            <Row
              label="Secondary diagnoses"
              info="Additional conditions to account for when programming. Shown to the AI generator alongside the primary diagnosis."
            >
              {secondary.join(", ")}
            </Row>
          )}

          {profile.painScore != null && (
            <Row
              label="Pain score"
              info="Client's self-reported pain, 0 (none) to 10 (worst imaginable). Captured at intake and updated when the client logs a pain assessment."
            >
              <PainScale score={profile.painScore} />
            </Row>
          )}

          {profile.limitations && (
            <Row
              label="Limitations"
              info="Movements or positions this client should avoid. Review these before assigning or generating a program."
            >
              {profile.limitations}
            </Row>
          )}

          {profile.comorbidities && (
            <Row
              label="Comorbidities"
              info="Co-occurring conditions that affect exercise tolerance, such as cardiovascular or metabolic conditions."
            >
              {profile.comorbidities}
            </Row>
          )}

          {profile.activityLevel && (
            <Row
              label="Activity level"
              info="The client's baseline activity before starting this program. Used to set starting intensity."
            >
              <span className="capitalize">{profile.activityLevel.toLowerCase()}</span>
            </Row>
          )}

          {profile.surgeryHistory && <Row label="Surgery history">{profile.surgeryHistory}</Row>}

          {profile.injuryDate && (
            <Row label="Injury date">
              {new Date(profile.injuryDate).toLocaleDateString()}
            </Row>
          )}

          {profile.occupation && <Row label="Occupation">{profile.occupation}</Row>}

          {(profile.fitnessGoals?.length ?? 0) > 0 && (
            <Row label="Goals">
              <span className="flex flex-wrap gap-1.5">
                {profile.fitnessGoals!.map((g) => (
                  <Badge key={g} variant="secondary" className="font-normal">
                    {g}
                  </Badge>
                ))}
              </span>
            </Row>
          )}

          {(profile.availableEquipment?.length ?? 0) > 0 && (
            <Row label="Equipment">
              <span className="flex flex-wrap gap-1.5">
                {profile.availableEquipment!.map((eq) => (
                  <Badge key={eq} variant="outline" className="font-normal">
                    {eq}
                  </Badge>
                ))}
              </span>
            </Row>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}
