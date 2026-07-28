import { Flame, Beef, Wheat, Cookie } from "lucide-react";
import { cn } from "@/lib/utils";

interface MacroRow {
  label: string;
  consumed: number;
  target: number | null;
  unit: string;
  icon: React.ElementType;
  color: string;
}

interface MacroProgressBarsProps {
  calories: { consumed: number; target: number | null };
  proteinG: { consumed: number; target: number | null };
  carbsG: { consumed: number; target: number | null };
  fatG: { consumed: number; target: number | null };
}

function Bar({ label, consumed, target, unit, icon: Icon, color }: MacroRow) {
  const pct = target ? Math.round((consumed / target) * 100) : null;
  const exceeded = pct !== null && pct > 100;
  const width = pct === null ? 0 : Math.min(pct, 100);

  return (
    <div className="flex items-center gap-3">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${color}1a` }}
      >
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="font-medium text-foreground/80">{label}</span>
          <span className="text-muted-foreground tabular-nums">
            {Math.round(consumed)}
            {target ? `/${target}` : ""}
            {unit}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all duration-300", exceeded && "!bg-destructive")}
            style={{ width: target ? `${width}%` : "0%", backgroundColor: exceeded ? undefined : color }}
          />
        </div>
      </div>
    </div>
  );
}

export function MacroProgressBars({ calories, proteinG, carbsG, fatG }: MacroProgressBarsProps) {
  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
      <Bar label="Calories" consumed={calories.consumed} target={calories.target} unit=" kcal" icon={Flame} color="#f97316" />
      <Bar label="Protein" consumed={proteinG.consumed} target={proteinG.target} unit="g" icon={Beef} color="#3b82f6" />
      <Bar label="Carbs" consumed={carbsG.consumed} target={carbsG.target} unit="g" icon={Wheat} color="#22c55e" />
      <Bar label="Fat" consumed={fatG.consumed} target={fatG.target} unit="g" icon={Cookie} color="#eab308" />
    </div>
  );
}
