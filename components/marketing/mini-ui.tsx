import Image from "next/image";
import { Check, ChevronDown, Sparkles, UserRound, Upload, TrendingUp, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Small product-UI illustrations that sit at the bottom of marketing feature cards. */

function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-sand-line bg-white/80 p-3.5 text-ink", className)}>{children}</div>
  );
}

export function WeekPlanBars() {
  const bars = [28, 36, 44, 58, 70, 92, 80];
  return (
    <Panel className="flex items-end justify-between gap-3">
      <p className="self-start text-xs leading-tight font-medium">
        Your plan
        <br />
        this week
      </p>
      <div className="flex items-end gap-1.5">
        {bars.map((h, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div
              className={cn("w-2.5 rounded-full", i === 6 ? "bg-sand" : "bg-clay/70")}
              style={{ height: `${h * 0.6}px` }}
            />
            <span className="text-[9px] text-ink-soft">{"MTWTFSS"[i]}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function WorkoutComplete() {
  return (
    <Panel>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium">Workout complete</p>
          <p className="text-[10px] text-ink-soft">Great work today!</p>
        </div>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sand">
          <Check className="h-3.5 w-3.5" aria-hidden />
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2">
        <div>
          <p className="text-base font-medium">24:32</p>
          <p className="text-[10px] text-ink-soft">Duration</p>
        </div>
        <div>
          <p className="text-base font-medium">8</p>
          <p className="text-[10px] text-ink-soft">Exercises</p>
        </div>
      </div>
    </Panel>
  );
}

function Avatar({ initial }: { initial: string }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-clay/80 text-[10px] font-medium text-white">
      {initial}
    </span>
  );
}

export function ChatSnippet({
  sender = "Coach",
  message = "Great session today! Keep up the momentum.",
  reply = "Thanks! Feeling strong 💪",
}: {
  sender?: string;
  message?: string;
  reply?: string;
}) {
  return (
    <Panel className="space-y-2.5">
      <div className="flex items-center gap-2">
        <Avatar initial={sender[0]} />
        <span className="text-[11px] font-medium">{sender}</span>
        <span className="ml-auto text-[9px] text-ink-soft">10:24 AM</span>
      </div>
      <p className="ml-8 w-fit rounded-lg bg-cream-deep px-2.5 py-1.5 text-[10px] leading-snug text-ink-soft">
        {message}
      </p>
      <div className="flex items-center gap-2">
        <Avatar initial="Y" />
        <p className="rounded-lg border border-sand-line bg-white px-2.5 py-1.5 text-[10px] leading-snug">{reply}</p>
      </div>
    </Panel>
  );
}

export function NutritionRing() {
  const macros = [
    { label: "Protein", value: "120g", tone: "bg-ember" },
    { label: "Carbs", value: "210g", tone: "bg-clay" },
    { label: "Fats", value: "60g", tone: "bg-sand" },
  ];
  // 1850 of 2200 kcal
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <Panel>
      <p className="text-xs font-medium">Today&apos;s nutrition</p>
      <div className="mt-3 flex items-center gap-4">
        <div className="relative h-[68px] w-[68px] shrink-0">
          <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90" aria-hidden>
            <circle cx="32" cy="32" r={r} fill="none" strokeWidth="5" className="stroke-sand/60" />
            <circle
              cx="32"
              cy="32"
              r={r}
              fill="none"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - 1850 / 2200)}
              className="stroke-ember"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-sm font-medium">1,850</span>
            <span className="text-[8px] text-ink-soft">of 2,200 cal</span>
          </div>
        </div>
        <ul className="flex-1 space-y-1.5">
          {macros.map((m) => (
            <li key={m.label} className="flex items-center gap-1.5 text-[10px]">
              <span className={cn("h-1.5 w-1.5 rounded-full", m.tone)} />
              <span className="font-medium">{m.label}</span>
              <span className="ml-auto text-ink-soft">{m.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}

export function ProgressChart({ second = "Endurance" }: { second?: string }) {
  return (
    <Panel>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium">Progress</p>
        <span className="flex items-center gap-1 rounded-md border border-sand-line px-1.5 py-0.5 text-[9px]">
          3 months <ChevronDown className="h-2.5 w-2.5" aria-hidden />
        </span>
      </div>
      <svg viewBox="0 0 160 44" className="mt-2 h-11 w-full" aria-hidden>
        <polyline
          points="0,38 14,34 26,36 40,28 54,31 68,24 82,26 96,18 110,21 124,13 140,15 160,4"
          fill="none"
          strokeWidth="1.5"
          strokeLinejoin="round"
          className="stroke-ember"
        />
      </svg>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {[
          { v: "+24%", l: "Strength" },
          { v: "+18%", l: second },
        ].map((s) => (
          <div key={s.l} className="flex items-start gap-1.5">
            <TrendingUp className="mt-0.5 h-3 w-3 text-clay" aria-hidden />
            <div>
              <p className="text-xs font-medium">{s.v}</p>
              <p className="text-[9px] text-ink-soft">{s.l}</p>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function CreateProgramMenu() {
  const items = [
    { icon: Sparkles, label: "Generate with AI", active: true },
    { icon: UserRound, label: "Start from scratch" },
    { icon: Upload, label: "Upload existing program" },
  ];
  return (
    <Panel className="space-y-1.5">
      <p className="mb-2 text-xs font-medium">Create Program</p>
      {items.map(({ icon: Icon, label, active }) => (
        <div
          key={label}
          className={cn(
            "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[10px]",
            active ? "border-transparent bg-cream-deep" : "border-sand-line",
          )}
        >
          <Icon className="h-3 w-3" aria-hidden />
          {label}
        </div>
      ))}
    </Panel>
  );
}

export function FollowAlongCard() {
  return (
    <div className="relative aspect-[16/10] overflow-hidden rounded-xl">
      <Image src="/landing/indiv-program.jpg" alt="Hip Mobility, 8 minute follow-along session" fill sizes="300px" className="object-cover" />
    </div>
  );
}

/** Frosted "You're on track" status card for the home CTA band. */
export function OnTrackCard() {
  const rows = [
    { label: "Workouts", value: "12 / 12", pct: 85 },
    { label: "Nutrition", value: "On track", pct: 92 },
    { label: "Recovery", value: "Improved", pct: 70 },
  ];
  return (
    <div className="w-72 rounded-2xl border border-white/40 bg-white/25 p-5 text-white shadow-lg backdrop-blur-md">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-5 w-5" aria-hidden />
        <p className="text-base">You&apos;re on track.</p>
      </div>
      <ul className="mt-4 space-y-3">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[4.5rem_4.5rem_1fr] items-center text-[11px]">
            <span className="text-white/80">{r.label}</span>
            <span className="text-white/90">{r.value}</span>
            <span className="h-1 rounded-full bg-white/30">
              <span className="block h-full rounded-full bg-white" style={{ width: `${r.pct}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
