"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BODY_REGIONS, DIFFICULTY_LEVELS } from "@/lib/utils/constants";
import { generatePlanAction } from "@/actions/workout-actions";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";

interface GeneratePlanFormProps {
  clients: { id: string; firstName: string; lastName: string }[];
}

export function GeneratePlanForm({ clients }: GeneratePlanFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState("");
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState("BEGINNER");
  const [duration, setDuration] = useState(25);
  const [daysPerWeek, setDaysPerWeek] = useState(3);

  function toggleArea(area: string) {
    setSelectedAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
    );
  }

  async function handleGenerate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (selectedAreas.length === 0) {
      toast.error("Please select at least one focus area");
      return;
    }

    setLoading(true);
    const formData = new FormData(e.currentTarget);

    const result = await generatePlanAction({
      clientId: selectedClient || null,
      focusAreas: selectedAreas,
      durationMinutes: duration,
      daysPerWeek,
      difficultyLevel: difficulty,
      additionalNotes: (formData.get("notes") as string) || undefined,
    });

    setLoading(false);

    if (result.success) {
      toast.success("Plan generated successfully!");
      router.push(`/workout-plans/${result.data.id}`);
    } else {
      toast.error(result.error);
    }
  }

  return (
    <form onSubmit={handleGenerate}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand-foreground" />
            AI Plan Generator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Client selection (optional) */}
          <div className="space-y-2">
            <Label>Client <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <select
              className="flex h-8 w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm"
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
            >
              <option value="">No client — general program</option>
              {clients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.firstName} {p.lastName}
                </option>
              ))}
            </select>
          </div>

          {/* Focus areas */}
          <div className="space-y-2">
            <Label>Focus Areas *</Label>
            <div className="flex flex-wrap gap-2">
              {BODY_REGIONS.map((r) => (
                <Button
                  key={r.value}
                  type="button"
                  variant={selectedAreas.includes(r.value) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleArea(r.value)}
                >
                  {r.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Difficulty */}
          <div className="space-y-2">
            <Label>Difficulty Level</Label>
            <div className="flex gap-2">
              {DIFFICULTY_LEVELS.map((d) => (
                <Button
                  key={d.value}
                  type="button"
                  variant={difficulty === d.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDifficulty(d.value)}
                >
                  {d.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Duration and frequency */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Session Duration (minutes)</Label>
              <select
                className="flex h-8 w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              >
                {[15, 20, 25, 30, 45, 60].map((m) => (
                  <option key={m} value={m}>{m} minutes</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Days Per Week</Label>
              <select
                className="flex h-8 w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm"
                value={daysPerWeek}
                onChange={(e) => setDaysPerWeek(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <option key={d} value={d}>{d} {d === 1 ? "day" : "days"}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Additional Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              placeholder="Any specific requirements, modifications, or goals..."
            />
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Plan
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
