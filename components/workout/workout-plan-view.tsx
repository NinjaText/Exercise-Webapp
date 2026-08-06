import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlanStatusBadge } from "./plan-status-badge";
import { MedicalDisclaimer } from "@/components/shared/medical-disclaimer";
import { formatBodyRegion } from "@/lib/utils/formatting";
import type { WorkoutPlan, PlanExercise, Exercise } from "@prisma/client";

interface WorkoutPlanViewProps {
  plan: WorkoutPlan & {
    exercises: Array<PlanExercise & { exercise: Exercise; feedback: Array<{ rating: string }> }>;
    completedSessions: number;
  };
}

export function WorkoutPlanView({ plan }: WorkoutPlanViewProps) {
  return (
    <div className="space-y-6">
      <MedicalDisclaimer />

      <div>
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-bold">{plan.title}</h1>
          <PlanStatusBadge status={plan.status} />
        </div>
        {plan.description && (
          <p className="text-muted-foreground">{plan.description}</p>
        )}
        <div className="flex gap-3 mt-3">
          {plan.durationMinutes && (
            <Badge variant="outline">{plan.durationMinutes} min</Badge>
          )}
          {plan.daysPerWeek && (
            <Badge variant="outline">{plan.daysPerWeek} days/week</Badge>
          )}
          <Badge variant="outline">{plan.exercises.length} exercises</Badge>
          <Badge variant="outline">{plan.completedSessions} sessions completed</Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Exercises</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {plan.exercises
            .filter((pe) => pe.isActive)
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .map((pe) => {
              const feltGood = pe.feedback.filter((f) => f.rating === "felt_good").length;
              const painful = pe.feedback.filter((f) => f.rating === "painful").length;

              return (
                <div
                  key={pe.id}
                  className="flex items-start gap-3 p-3 rounded-md border"
                >
                  <div className="bg-muted flex h-8 w-8 items-center justify-center rounded text-sm font-medium shrink-0">
                    {pe.orderIndex + 1}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{pe.exercise.name}</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {pe.exercise.bodyRegion.map((region) => (
                        <Badge key={region} variant="outline" className="text-xs">
                          {formatBodyRegion(region)}
                        </Badge>
                      ))}
                      <span className="text-muted-foreground text-xs">
                        {pe.sets} sets
                      </span>
                      {pe.reps && (
                        <span className="text-muted-foreground text-xs">
                          x {pe.reps} reps
                        </span>
                      )}
                      {pe.durationSeconds && (
                        <span className="text-muted-foreground text-xs">
                          {pe.durationSeconds}s hold
                        </span>
                      )}
                    </div>
                    {pe.notes && (
                      <p className="text-muted-foreground text-xs mt-1 italic">
                        {pe.notes}
                      </p>
                    )}
                    {pe.feedback.length > 0 && (
                      <div className="flex gap-2 mt-2">
                        {feltGood > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {feltGood} felt good
                          </Badge>
                        )}
                        {painful > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            {painful} painful
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
        </CardContent>
      </Card>
    </div>
  );
}
