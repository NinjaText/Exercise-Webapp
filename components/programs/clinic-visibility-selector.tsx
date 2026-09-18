"use client";

import { useState } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface Props {
  clinics: { id: string; name: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
}

export function ClinicVisibilitySelector({ clinics, value, onChange }: Props) {
  const [mode, setMode] = useState<"all" | "specific">(
    value.length > 0 ? "specific" : "all"
  );

  function handleModeChange(next: "all" | "specific") {
    setMode(next);
    if (next === "all") {
      onChange([]);
    }
  }

  function toggle(clinicId: string, checked: boolean) {
    onChange(
      checked ? [...value, clinicId] : value.filter((id) => id !== clinicId)
    );
  }

  return (
    <div className="space-y-3">
      <Label>Visibility</Label>
      <RadioGroup value={mode} onValueChange={handleModeChange}>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="all" id="visibility-all" />
          <Label htmlFor="visibility-all" className="font-normal">
            All Clinics
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="specific" id="visibility-specific" />
          <Label htmlFor="visibility-specific" className="font-normal">
            Specific Clinics
          </Label>
        </div>
      </RadioGroup>
      {mode === "specific" && (
        <div className="space-y-2 rounded-md border p-3">
          {clinics.length === 0 ? (
            <p className="text-sm text-muted-foreground">No clinics found.</p>
          ) : (
            <div className="max-h-48 space-y-2 overflow-y-auto">
              {clinics.map((clinic) => (
                <div key={clinic.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`clinic-visibility-${clinic.id}`}
                    checked={value.includes(clinic.id)}
                    onCheckedChange={(checked) =>
                      toggle(clinic.id, checked === true)
                    }
                  />
                  <Label
                    htmlFor={`clinic-visibility-${clinic.id}`}
                    className="font-normal"
                  >
                    {clinic.name}
                  </Label>
                </div>
              ))}
            </div>
          )}
          {value.length === 0 && (
            <p className="text-sm text-warning">
              Select at least one clinic, or choose All Clinics.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
