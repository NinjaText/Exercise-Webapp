import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Calendar, AlertCircle, CheckCircle, SkipForward } from "lucide-react";

interface AdherenceStatsProps {
  stats: {
    weeklyCompliance: number;
    totalSessions: number;
    avgPainLevel: number;
    exercisesCompleted: number;
    exercisesSkipped: number;
  };
}

export function AdherenceStats({ stats }: AdherenceStatsProps) {
  const statCards = [
    {
      title: "Weekly Compliance",
      value: `${stats.weeklyCompliance}%`,
      icon: Activity,
      description: "Current week",
    },
    {
      title: "Total Sessions",
      value: stats.totalSessions.toString(),
      icon: Calendar,
      description: "All time",
    },
    {
      title: "Avg Pain Level",
      value: `${stats.avgPainLevel}/10`,
      icon: AlertCircle,
      description: "Self-reported",
    },
    {
      title: "Exercises Completed",
      value: stats.exercisesCompleted.toString(),
      icon: CheckCircle,
      description: "Total completed",
    },
    {
      title: "Exercises Skipped",
      value: stats.exercisesSkipped.toString(),
      icon: SkipForward,
      description: "Total skipped",
    },
  ];

  return (
    <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
      {statCards.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs text-muted-foreground font-medium">
              {stat.title}
            </CardTitle>
            <stat.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
