import { Dumbbell, Flame, Beef, Droplet, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface Breakdown {
  workout: number;
  calories: number;
  protein: number;
  water: number;
  checkIn: number;
}

interface AccountabilityScoreCardProps {
  dailyScore: number;
  dailyBreakdown: Breakdown;
  weeklyScore: number;
}

const ROWS: { key: keyof Breakdown; label: string; max: number; icon: React.ElementType; color: string }[] = [
  { key: "workout", label: "Workout", max: 30, icon: Dumbbell, color: "#8b5cf6" },
  { key: "calories", label: "Calories ±10%", max: 20, icon: Flame, color: "#f97316" },
  { key: "protein", label: "Protein ±10%", max: 20, icon: Beef, color: "#3b82f6" },
  { key: "water", label: "Water goal", max: 10, icon: Droplet, color: "#0ea5e9" },
  { key: "checkIn", label: "Check-in", max: 20, icon: ClipboardCheck, color: "#22c55e" },
];

function scoreColor(score: number) {
  if (score >= 80) return "#10b981";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}

function ScoreRing({ score, size = 68 }: { score: number; size?: number }) {
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);
  const color = scoreColor(score);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 400ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold tabular-nums" style={{ color }}>
          {score}
        </span>
      </div>
    </div>
  );
}

export function AccountabilityScoreCard({ dailyScore, dailyBreakdown, weeklyScore }: AccountabilityScoreCardProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 rounded-lg bg-muted/30 p-3">
        <ScoreRing score={dailyScore} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">Today's Score</p>
          <p className="text-xs text-muted-foreground">out of 100</p>
        </div>
        <div className="h-9 w-px bg-border" />
        <div className="text-center">
          <p className="text-xl font-bold tabular-nums" style={{ color: scoreColor(weeklyScore) }}>
            {weeklyScore}
          </p>
          <p className="text-[10px] text-muted-foreground">7-day avg</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {ROWS.map((row) => {
          const earned = dailyBreakdown[row.key];
          const hit = earned > 0;
          const Icon = row.icon;
          return (
            <div
              key={row.key}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2 py-1.5 ring-1",
                hit ? "ring-transparent" : "ring-border/40"
              )}
              style={hit ? { backgroundColor: `${row.color}0d` } : undefined}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: hit ? row.color : "var(--muted-foreground)" }} />
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-[11px] leading-tight", hit ? "font-medium text-foreground" : "text-muted-foreground")}>
                  {row.label}
                </p>
                <p
                  className="text-[10px] font-semibold tabular-nums leading-tight"
                  style={{ color: hit ? row.color : "var(--muted-foreground)" }}
                >
                  +{earned}/{row.max}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
