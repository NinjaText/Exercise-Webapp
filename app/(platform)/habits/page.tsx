import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import * as habitService from "@/lib/services/habit.service";
import { getClientsForTrainer } from "@/lib/services/client.service";
import { HabitCard } from "@/components/habits/habit-card";
import { AddHabitDialog } from "@/components/habits/add-habit-dialog";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Card } from "@/components/ui/card";
import { CalendarDays, Sparkles, Target } from "lucide-react";

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
    <PageShell>
      <PageHeader title="My Habits" description={getTodayLabel()} primaryAction={<AddHabitDialog />} />

      {/* ── Daily progress summary ────────────────────────────────────── */}
      {totalHabits > 0 && (
        <Card className="flex-row items-center gap-3 px-5 py-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success-foreground">
            <Sparkles className="size-4" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-label text-foreground tabular-nums">
              {completedToday} of {totalHabits} habits done today
            </p>
            <p className="text-caption">
              {completedToday === totalHabits && totalHabits > 0
                ? "Amazing — you nailed all your habits today!"
                : `${totalHabits - completedToday} remaining`}
            </p>
          </div>
        </Card>
      )}

      {/* ── Empty state ───────────────────────────────────────────────── */}
      {totalHabits === 0 && (
        <Card className="py-0">
          <EmptyState
            icon={Target}
            title="No habits yet"
            description="Add your first habit to start building consistency."
            action={<AddHabitDialog triggerLabel="Add your first habit" />}
          />
        </Card>
      )}

      {/* ── Today's habits grid ───────────────────────────────────────── */}
      {totalHabits > 0 && (
        <section aria-labelledby="habits-today" className="flex flex-col gap-4">
          <h2 id="habits-today" className="text-heading text-foreground">
            Today
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
        <SectionCard title="This Week" icon={CalendarDays} contentClassName="px-0 pb-0">
          <ul className="divide-y divide-border border-t border-border">
            {habits.map((habit) => {
              const wl = weekLogsByHabit.get(habit.id) ?? [];
              const doneThisWeek = wl.filter((l) => l.completed).length;

              return (
                <li key={habit.id} className="flex items-center gap-4 px-5 py-3">
                  <span className="text-xl" aria-hidden="true">
                    {habit.icon ?? "🎯"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-label text-foreground">
                    {habit.name}
                  </span>
                  <span className="shrink-0 text-caption tabular-nums">
                    {doneThisWeek}/7
                  </span>
                  {/* Inline week dots */}
                  <div className="shrink-0">
                    {/* Reuse the HabitWeekGrid but it's already imported client-side
                        We render it server-side via data — it's a purely visual component */}
                    <WeekDots logs={wl} />
                  </div>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      )}
    </PageShell>
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
    <PageShell>
      <PageHeader
        title="Client Habits"
        description={
          totalHabits > 0
            ? `${totalHabits} habit${totalHabits !== 1 ? "s" : ""} assigned across ${grouped.length} client${grouped.length !== 1 ? "s" : ""}`
            : "Assign habits to your clients to help them build healthy routines"
        }
        primaryAction={<AddHabitDialog clients={clients} />}
      />

      {/* ── Empty state ───────────────────────────────────────────────── */}
      {grouped.length === 0 && (
        <Card className="py-0">
          <EmptyState
            icon={Target}
            title="No habits assigned yet"
            description="Assign daily habits to your clients — hydration, sleep, mobility work and more."
            action={
              clients.length > 0 ? (
                <AddHabitDialog clients={clients} triggerLabel="Assign first habit" />
              ) : undefined
            }
          />
        </Card>
      )}

      {/* ── Grouped by client ────────────────────────────────────────── */}
      {grouped.map(({ client, habits }) => (
        <section key={client.id} aria-label={`${client.firstName} ${client.lastName}`} className="flex flex-col gap-4">
          <h2 className="flex items-baseline gap-2 text-heading text-foreground">
            {client.firstName} {client.lastName}
            <span className="text-caption font-normal tabular-nums">
              {habits.length} habit{habits.length !== 1 ? "s" : ""}
            </span>
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
    </PageShell>
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
                  ? "bg-success"
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
