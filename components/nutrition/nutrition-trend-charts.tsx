"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { format } from "date-fns";
import { Flame } from "lucide-react";

interface HistoryPoint {
  date: Date | string;
  consumed: { calories: number; proteinG: number; carbsG: number; fatG: number };
  adherencePct: number | null;
}

interface NutritionTrendChartsProps {
  history: HistoryPoint[];
  streak: number;
}

function ChartTooltip({
  active,
  payload,
  label,
  suffix = "",
}: {
  active?: boolean;
  payload?: { value: number; name: string; color: string }[];
  label?: string;
  suffix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 shadow-md text-xs space-y-0.5">
      <p className="font-medium text-foreground">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {Math.round(p.value)}
          {suffix}
        </p>
      ))}
    </div>
  );
}

export function NutritionTrendCharts({ history, streak }: NutritionTrendChartsProps) {
  const data = history.map((p) => ({
    date: format(new Date(p.date), "MMM d"),
    calories: Math.round(p.consumed.calories),
    protein: Math.round(p.consumed.proteinG),
    carbs: Math.round(p.consumed.carbsG),
    fat: Math.round(p.consumed.fatG),
    adherence: p.adherencePct,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 rounded-lg bg-orange-500/10 px-3 py-2 text-sm">
        <Flame className="h-4 w-4 text-orange-500" />
        <span className="font-semibold">{streak}</span>
        <span className="text-muted-foreground">day logging streak</span>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">Calories</p>
        <div className="h-[180px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={36} />
              <Tooltip content={<ChartTooltip suffix=" kcal" />} />
              <Line type="monotone" dataKey="calories" name="Calories" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">Macros (g)</p>
        <div className="h-[180px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={36} />
              <Tooltip content={<ChartTooltip suffix="g" />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="protein" name="Protein" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="carbs" name="Carbs" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="fat" name="Fat" stroke="#eab308" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">Adherence %</p>
        <div className="h-[180px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={36} />
              <Tooltip content={<ChartTooltip suffix="%" />} />
              <Line
                type="monotone"
                dataKey="adherence"
                name="Adherence"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
