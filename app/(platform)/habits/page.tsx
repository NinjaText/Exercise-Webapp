import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import * as habitService from "@/lib/services/habit.service";
import { getClientsForTrainer } from "@/lib/services/client.service";
import { HabitCard } from "@/components/habits/habit-card";
import { AddHabitDialog } from "@/components/habits/add-habit-dialog";
import { Sparkles } from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTodayLabel(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/** Returns the Monday of the current week (UTC midnight). */
function getWeekMonday(): Date {
  const today = new Date();
  const day = today.getUTCDay();
  const diff = (day + 6) % 7;
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - diff));
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function HabitsPage() {
  const user = await getCurrentUser();

  if (user.role === "TRAINER") {
    return <TrainerHabitsView trainerId={user.id} />;
  }

  return <ClientHabitsView clientId={user.id} />;
}

// ─── Client View ─────────────────────────────────────────────────────────────

async function ClientHabitsView({ clientId }: { clientId: string }) {
  const weekMonday = getWeekMonday();

  // Fetch all active habits with today's log and this week's logs together
  const habits = await habitService.getHabitsOverview(clientId);

  // Fetch this week's logs for the week-grid — one query for all habit ids
  const habitIds = habits.map((h) => h.id);
  const weekLogs = await prisma.habitLog.findMany({
    where: {
      habitId: { in: habitIds },
      date: { gte: weekMonday },
    },
    select: { habitId: true, date: true, completed: true },
  });

  // Group week logs by habit id for O(1) lookup
  const weekLogsByHabit = new Map<string, { date: Date; completed: boolean }[]>();
  for (const log of weekLogs) {
    const existing = weekLogsByHabit.get(log.habitId) ?? [];
    existing.push({ date: log.date, completed: log.completed });
    weekLogsByHabit.set(log.habitId, existing);
  }

  const completedToday = habits.filter((h) => h.logs[0]?.completed).length;
  const totalHabits    = habits.length;

  return (
    <div className="space-y-8">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight">My Habits</h2>
          <p className="text-muted-foreground">{getTodayLabel()}</p>
        </div>
        <AddHabitDialog />
      </div>

      {/* ── Daily progress summary ────────────────────────────────────── */}
      {totalHabits > 0 && (
        <div className="flex items-center gap-3 rounded-xl bg-muted/40 px-4 py-3 ring-1 ring-border/40">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15">
            <Sparkles className="h-4 w-4 text-emerald-500" />
          </div>
          <div>
            <p className="text-sm font-semibold">
              {completedToday} of {totalHabits} habits done today
            </p>
            <p className="text-xs text-muted-foreground">
              {completedToday === totalHabits && totalHabits > 0
                ? "Amazing — you nailed all your habits today!"
                : `${totalHabits - completedToday} remaining`}
            </p>
          </div>
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────── */}
      {totalHabits === 0 && (
        <div className="rounded-xl border border-dashed border-border p-16 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-3xl">
            🎯
          </div>
          <h3 className="mt-5 text-lg font-semibold">No habits yet</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Add your first habit to start building consistency.
          </p>
          <div className="mt-5">
            <AddHabitDialog triggerLabel="Add your first habit" />
          </div>
        </div>
      )}

      {/* ── Today's habits grid ───────────────────────────────────────── */}
      {totalHabits > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Today
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {habits.map((habit) => (
              <HabitCard
                key={habit.id}
                habit={{
                  ...habit,
                  weekLogs: weekLogsByHabit.get(habit.id) ?? [],
                }}
                showDelete
              />
            ))}
          </div>
        </section>
      )}

      {/* ── This Week overview ────────────────────────────────────────── */}
      {totalHabits > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            This Week
          </h3>
          <div className="space-y-2">
            {habits.map((habit) => {
              const wl = weekLogsByHabit.get(habit.id) ?? [];
              const doneThisWeek = wl.filter((l) => l.completed).length;

              return (
                <div
                  key={habit.id}
                  className="flex items-center gap-4 rounded-xl border-0 px-4 py-3 ring-1 ring-border/50 shadow-sm"
                >
                  <span className="text-xl" aria-hidden="true">
                    {habit.icon ?? "🎯"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {habit.name}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {doneThisWeek}/7
                  </span>
                  {/* Inline week dots */}
                  <div className="shrink-0">
                    {/* Reuse the HabitWeekGrid but it's already imported client-side
                        We render it server-side via data — it's a purely visual component */}
                    <WeekDots logs={wl} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Trainer View ───────────────────────────────────────────────────────────

async function TrainerHabitsView({ trainerId }: { trainerId: string }) {
  const [grouped, linkedClients] = await Promise.all([
    habitService.getHabitsForTrainer(trainerId),
    getClientsForTrainer(trainerId),
  ]);

  const clients = linkedClients.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
  }));
  const totalHabits = grouped.reduce((sum, g) => sum + g.habits.length, 0);

  return (
    <div className="space-y-8">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight">Client Habits</h2>
          <p className="text-muted-foreground">
            {totalHabits > 0
              ? `${totalHabits} habit${totalHabits !== 1 ? "s" : ""} assigned across ${grouped.length} client${grouped.length !== 1 ? "s" : ""}`
              : "Assign habits to your clients to help them build healthy routines"}
          </p>
        </div>
        <AddHabitDialog clients={clients} />
      </div>

      {/* ── Empty state ───────────────────────────────────────────────── */}
      {grouped.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-16 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-3xl">
            🎯
          </div>
          <h3 className="mt-5 text-lg font-semibold">No habits assigned yet</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Assign daily habits to your clients — hydration, sleep, mobility
            work and more.
          </p>
          {clients.length > 0 && (
            <div className="mt-5">
              <AddHabitDialog clients={clients} triggerLabel="Assign first habit" />
            </div>
          )}
        </div>
      )}

      {/* ── Grouped by client ────────────────────────────────────────── */}
      {grouped.map(({ client, habits }) => (
        <section key={client.id} className="space-y-3">
          <h3 className="text-sm font-semibold">
            {client.firstName} {client.lastName}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {habits.length} habit{habits.length !== 1 ? "s" : ""}
            </span>
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {habits.map((habit) => (
              <HabitCard
                key={habit.id}
                habit={{ ...habit, stats: undefined }}
                showDelete
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ─── Inline server-renderable week dots ──────────────────────────────────────
// A small server-side-safe dots renderer to avoid importing the client component
// at the top of a server page (which would force the whole page to be client-side).

const DAYS = ["M", "T", "W", "T", "F", "S", "S"] as const;

function toDateOnlyTime(d: Date | string): number {
  const src = typeof d === "string" ? new Date(d) : d;
  return Date.UTC(src.getUTCFullYear(), src.getUTCMonth(), src.getUTCDate());
}

function WeekDots({ logs }: { logs: { date: Date | string; completed: boolean }[] }) {
  const todayTime  = toDateOnlyTime(new Date());
  const today      = new Date();
  const dayOfWeek  = today.getUTCDay();
  const diff       = (dayOfWeek + 6) % 7;
  const mondayTime = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - diff);

  const completedSet = new Set(
    logs.filter((l) => l.completed).map((l) => toDateOnlyTime(l.date))
  );

  return (
    <div className="flex items-center gap-1">
      {DAYS.map((label, i) => {
        const dayTime  = mondayTime + i * 24 * 60 * 60 * 1000;
        const isFuture = dayTime > todayTime;
        const isDone   = completedSet.has(dayTime);
        const isToday  = dayTime === todayTime;

        return (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <div
              className={[
                "h-2 w-2 rounded-full",
                isDone
                  ? "bg-emerald-500"
                  : isFuture
                  ? "bg-muted-foreground/20"
                  : "border border-muted-foreground/40 bg-transparent",
              ].join(" ")}
            />
            <span
              className={[
                "text-[9px] font-medium leading-none",
                isToday ? "text-primary" : "text-muted-foreground/60",
              ].join(" ")}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
