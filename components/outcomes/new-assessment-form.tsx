"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createAssessmentAction } from "@/actions/assessment-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { FormField } from "@/components/shared/form-section";
import { ASSESSMENT_TYPES } from "@/lib/utils/constants";
import { NATIVE_SELECT_CLASS } from "@/lib/ui/native-select";
import { Loader2 } from "lucide-react";

interface Props {
  role: string;
  selfClientId?: string;
  clients: { id: string; firstName: string; lastName: string }[];
}

export function NewAssessmentForm({ role, selfClientId, clients }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [clientId, setClientId] = useState(selfClientId ?? "");
  const [assessmentType, setAssessmentType] = useState("");
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");

  const selectedType = ASSESSMENT_TYPES.find((t) => t.value === assessmentType);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (role === "TRAINER" && !clientId) {
      toast.error("Please select a client");
      return;
    }
    if (!assessmentType) {
      toast.error("Please select an assessment type");
      return;
    }
    if (!value) {
      toast.error("Please enter a value");
      return;
    }

    setLoading(true);
    const result = await createAssessmentAction({
      clientId: role === "CLIENT" ? undefined : clientId,
      assessmentType,
      value: parseFloat(value),
      unit: selectedType?.unit ?? "",
      notes: notes || undefined,
    });
    setLoading(false);

    if (result.success) {
      toast.success("Assessment recorded successfully");
      router.push("/assessments");
    } else {
      toast.error(result.error ?? "Failed to record assessment");
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardContent className="flex flex-col gap-4">
          {/* Client selector — trainers only */}
          {role === "TRAINER" && (
            <FormField label="Client" htmlFor="assessment-client" required>
              {clients.length === 0 ? (
                <p className="text-body text-muted-foreground">
                  No linked clients. Add clients from the Clients page first.
                </p>
              ) : (
                <select
                  id="assessment-client"
                  className={NATIVE_SELECT_CLASS}
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  required
                >
                  <option value="">Select a client</option>
                  {clients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.firstName} {p.lastName}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          )}

          <FormField label="Assessment type" htmlFor="assessment-type" required>
            <select
              id="assessment-type"
              className={NATIVE_SELECT_CLASS}
              value={assessmentType}
              onChange={(e) => setAssessmentType(e.target.value)}
              required
            >
              <option value="">Select type</option>
              {ASSESSMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </FormField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Value" htmlFor="assessment-value" required>
              <Input
                id="assessment-value"
                type="number"
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Enter measurement"
                required
              />
            </FormField>
            <FormField label="Unit" htmlFor="assessment-unit">
              <Input
                id="assessment-unit"
                value={selectedType?.unit ?? "—"}
                readOnly
                className="bg-surface-muted text-muted-foreground"
              />
            </FormField>
          </div>

          <FormField label="Notes (optional)" htmlFor="assessment-notes">
            <Textarea
              id="assessment-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Any additional observations..."
            />
          </FormField>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />}
            Record Assessment
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
