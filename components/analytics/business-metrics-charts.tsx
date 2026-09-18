"use client";

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { TrendPoint } from "@/lib/services/business-metrics.service";

const tooltipStyle = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  color: "var(--foreground)",
  fontSize: "12px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
};

const axisTick = { fill: "var(--muted-foreground)", fontSize: 11 };

export function NewClientsTrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--chart-1)", fillOpacity: 0.05 }} />
        <Bar dataKey="value" fill="var(--chart-1)" radius={[4, 4, 0, 0]} name="New Clients" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AttendanceTrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          domain={[0, 100]}
          unit="%"
        />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ stroke: "var(--chart-3)", strokeOpacity: 0.2 }}
          formatter={(value) => [`${value}%`, "Attendance"]}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="var(--chart-3)"
          strokeWidth={2.5}
          dot={{ fill: "var(--chart-3)", r: 4, strokeWidth: 0 }}
          activeDot={{ r: 6, fill: "var(--chart-3)" }}
          name="Attendance"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
