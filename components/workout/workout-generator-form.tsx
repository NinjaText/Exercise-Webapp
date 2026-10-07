"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { workoutGenerationSchema, type WorkoutGenerationInput } from "@/lib/validators/workout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FITNESS_GOALS as FITNESS_GOAL_OPTIONS } from "@/lib/utils/constants";
import { EquipmentPicker } from "@/components/equipment/equipment-picker";
import { Loader2, Sparkles } from "lucide-react";
import type { GeneratedWorkout } from "@/lib/ai/schemas/workout-output";
import type { ClientProfile } from "@prisma/client";

interface WorkoutGeneratorFormProps {
  clientId: string;
  clientProfile?: ClientProfile | null;
  onGenerated: (workout: GeneratedWorkout) => void;
}

export function WorkoutGeneratorForm({
  clientId,
  clientProfile,
  onGenerated,
}: WorkoutGeneratorFormProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<WorkoutGenerationInput>({
    resolver: zodResolver(workoutGenerationSchema) as never,
    defaultValues: {
      clientId,
      limitations: clientProfile?.limitations ?? "",
      comorbidities: clientProfile?.comorbidities ?? "",
      functionalChallenges: clientProfile?.functionalChallenges ?? "",
      availableEquipment: clientProfile?.availableEquipment ?? [],
      durationMinutes: clientProfile?.preferredDurationMinutes ?? 25,
      daysPerWeek: clientProfile?.preferredDaysPerWeek ?? 3,
      fitnessGoals: clientProfile?.fitnessGoals ?? [],
    },
  });

  const onSubmit = async (data: WorkoutGenerationInput) => {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/ai/generate-workout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.error?.message ?? "Failed to generate workout");
        return;
      }

      onGenerated(result.data);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Client Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="limitations"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Physical Limitations</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="e.g. Limited knee flexion, shoulder impingement..."
                      rows={3}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="comorbidities"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Comorbidities / Medical Conditions</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="e.g. Type 2 diabetes, osteoarthritis..."
                      rows={3}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="functionalChallenges"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Functional Challenges</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="e.g. Difficulty climbing stairs, poor balance..."
                      rows={3}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Available Equipment</CardTitle>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="availableEquipment"
              render={({ field }) => (
                <FormItem>
                  <EquipmentPicker value={field.value ?? []} onChange={(items) => field.onChange(items)} />
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workout Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="durationMinutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (minutes): {field.value}</FormLabel>
                    <FormControl>
                      <Input
                        type="range"
                        min={10}
                        max={90}
                        step={5}
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="daysPerWeek"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Days Per Week: {field.value}</FormLabel>
                    <FormControl>
                      <Input
                        type="range"
                        min={1}
                        max={7}
                        step={1}
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fitness Goals</CardTitle>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="fitnessGoals"
              render={({ field }) => (
                <FormItem>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {FITNESS_GOAL_OPTIONS.map((option) => (
                      <div key={option} className="flex items-center space-x-2">
                        <Checkbox
                          checked={field.value?.includes(option)}
                          onCheckedChange={(checked) => {
                            const current = field.value ?? [];
                            field.onChange(
                              checked
                                ? [...current, option]
                                : current.filter((v) => v !== option)
                            );
                          }}
                        />
                        <label className="text-sm">{option}</label>
                      </div>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {error && (
          <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
            {error}
          </div>
        )}

        <Button type="submit" disabled={isGenerating} className="w-full" size="lg">
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating Workout Plan...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate AI Workout Plan
            </>
          )}
        </Button>
      </form>
    </Form>
  );
}
