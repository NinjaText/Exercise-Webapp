"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils/dates";

/**
 * Everything the Create Program form needs to know about a client: the name for
 * the picker plus the full clinical profile shown in the side panel.
 *
 * `injuryDate` is an ISO-8601 string because the fetching server component
 * serialises the Prisma `DateTime` before handing it across the RSC boundary.
 */
export interface ClientSummary {
  id: string;
  firstName: string;
  lastName: string;
  primaryDiagnosis?: string | null;
  secondaryDiagnoses?: string[];
  painScore?: number | null;
  limitations?: string | null;
  comorbidities?: string | null;
  functionalChallenges?: string | null;
  activityLevel?: string | null;
  priorInjuries?: string[];
  surgeryHistory?: string | null;
  occupation?: string | null;
  fitnessGoals?: string[];
  injuryDate?: string | null;
  availableEquipment?: string[];
}

interface ClientDetailsPanelProps {
  client: ClientSummary;
  className?: string;
}

/**
 * Read-only summary of a client's clinical profile, rendered beside the program
 * form so the trainer can see what the AI will be planning against.
 *
 * Only fields that actually hold data are rendered — most clients have a
 * partially filled profile, and empty "—" rows make the panel harder to scan.
 */
export function ClientDetailsPanel({ client, className }: ClientDetailsPanelProps) {
  const secondaryDiagnoses = nonEmptyList(client.secondaryDiagnoses);
  const priorInjuries = nonEmptyList(client.priorInjuries);
  const fitnessGoals = nonEmptyList(client.fitnessGoals);
  const availableEquipment = nonEmptyList(client.availableEquipment);

  const hasAnyDetail =
    !!client.primaryDiagnosis ||
    secondaryDiagnoses.length > 0 ||
    client.painScore != null ||
    !!client.limitations ||
    !!client.comorbidities ||
    !!client.functionalChallenges ||
    !!client.activityLevel ||
    !!client.occupation ||
    !!client.injuryDate ||
    !!client.surgeryHistory ||
    priorInjuries.length > 0 ||
    fitnessGoals.length > 0 ||
    availableEquipment.length > 0;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">Client Details</CardTitle>
        <p className="text-sm text-muted-foreground">
          {client.firstName} {client.lastName}
        </p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!hasAnyDetail && (
          <p className="text-muted-foreground">
            No clinical details on file for this client yet.
          </p>
        )}

        {client.primaryDiagnosis && (
          <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2">
            <span className="font-semibold text-blue-800">Primary Diagnosis: </span>
            <span className="text-blue-700">{client.primaryDiagnosis}</span>
            {secondaryDiagnoses.length > 0 && (
              <p className="mt-0.5 text-xs text-blue-600">
                Also: {secondaryDiagnoses.join(", ")}
              </p>
            )}
          </div>
        )}

        {/* Secondary diagnoses still deserve a home when no primary Dx is recorded */}
        {!client.primaryDiagnosis && secondaryDiagnoses.length > 0 && (
          <DetailRow label="Secondary Diagnoses" value={secondaryDiagnoses.join(", ")} />
        )}

        {client.painScore != null && <PainScore score={client.painScore} />}

        {client.activityLevel && (
          <DetailRow label="Activity Level" value={client.activityLevel.toLowerCase()} capitalize />
        )}
        {client.occupation && <DetailRow label="Occupation" value={client.occupation} />}
        {client.injuryDate && (
          <DetailRow label="Injury Date" value={formatDate(client.injuryDate)} />
        )}
        {client.limitations && <DetailRow label="Limitations" value={client.limitations} />}
        {client.comorbidities && <DetailRow label="Comorbidities" value={client.comorbidities} />}
        {client.functionalChallenges && (
          <DetailRow label="Functional Challenges" value={client.functionalChallenges} />
        )}
        {client.surgeryHistory && (
          <DetailRow label="Surgery History" value={client.surgeryHistory} />
        )}
        {priorInjuries.length > 0 && (
          <DetailRow label="Prior Injuries" value={priorInjuries.join(", ")} />
        )}

        {fitnessGoals.length > 0 && (
          <BadgeRow label="Fitness Goals" items={fitnessGoals} variant="secondary" />
        )}
        {availableEquipment.length > 0 && (
          <BadgeRow label="Available Equipment" items={availableEquipment} variant="outline" />
        )}
      </CardContent>
    </Card>
  );
}

function DetailRow({
  label,
  value,
  capitalize = false,
}: {
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <div>
      <span className="font-medium">{label}: </span>
      <span className={`text-muted-foreground${capitalize ? " capitalize" : ""}`}>{value}</span>
    </div>
  );
}

function BadgeRow({
  label,
  items,
  variant,
}: {
  label: string;
  items: string[];
  variant: "secondary" | "outline";
}) {
  return (
    <div>
      <span className="font-medium">{label}</span>
      <div className="mt-1 flex flex-wrap gap-1">
        {items.map(item => (
          <Badge key={item} variant={variant} className="text-xs">
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function PainScore({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-medium">Pain Score:</span>
      <div className="flex items-center gap-1.5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className={`h-2.5 w-2.5 rounded-full ${
              i < score
                ? i < 3
                  ? "bg-green-400"
                  : i < 6
                  ? "bg-amber-400"
                  : "bg-red-500"
                : "bg-muted"
            }`}
          />
        ))}
        <span className="ml-1 text-muted-foreground">{score}/10</span>
      </div>
    </div>
  );
}

/** Guards against both a missing array and one holding only blank strings. */
function nonEmptyList(items: string[] | undefined): string[] {
  return (items ?? []).map(item => item.trim()).filter(Boolean);
}
