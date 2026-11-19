"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { format } from "date-fns";

interface MetricDataPoint {
  recordedAt: Date | string;
  value: number;
  unit: string;
}

interface BodyMetricChartProps {
  data: MetricDataPoint[];
  metricType: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: { value: number; payload: { unit: string; displayDate: string } }[];
  label?: string;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0];
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 shadow-md text-sm">
      <p className="font-medium text-foreground">{point.payload.displayDate}</p>
      <p className="text-muted-foreground">
        {point.value} {point.payload.unit}
      </p>
    </div>
  );
}

export function BodyMetricChart({ data, metricType }: BodyMetricChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center rounded-xl border border-dashed border-border">
        <p className="text-sm text-muted-foreground">
          No data recorded for {metricType} yet.
        </p>
      </div>
    );
  }

  const chartData = data.map((point) => ({
    date: format(new Date(point.recordedAt), "MMM d"),
    displayDate: format(new Date(point.recordedAt), "MMM d, yyyy"),
    value: point.value,
    unit: point.unit,
  }));

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#8b5a36"
            strokeWidth={2}
            dot={{ r: 4, fill: "#8b5a36", strokeWidth: 2, stroke: "#ffffff" }}
            activeDot={{ r: 6, fill: "#8b5a36" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
