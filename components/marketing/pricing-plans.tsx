"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { BarChart3, Check, Heart, Layers, Shield, Sparkles, Stethoscope, UserRound, Users } from "lucide-react";
import { Eyebrow, IconTile, PillLink } from "@/components/marketing/primitives";
import {
  CALENDLY_URL,
  INDIVIDUAL_TRIAL_HREF,
  parsePricingTab,
  trainerTrialHref,
  type PricingTab,
  type TrainerPlanKey,
} from "@/lib/marketing-links";
import { cn } from "@/lib/utils";

const TABS: { id: PricingTab; label: string }[] = [
  { id: "clubs", label: "Clubs" },
  { id: "trainers", label: "Trainers" },
  { id: "individuals", label: "Individuals" },
];

/* ── Plan data ─────────────────────────────────────────────────────────── */

const TRAINER_PLANS: {
  key: TrainerPlanKey;
  name: string;
  price: string;
  clients: string;
  blurb: string;
  badge?: string;
}[] = [
  {
    key: "STARTER",
    name: "Starter",
    price: "$39.99",
    clients: "1 – 10 active clients",
    blurb: "For independent professionals getting started.",
  },
  {
    key: "PRO",
    name: "Growth",
    price: "$79.99",
    clients: "11 – 30 active clients",
    blurb: "For professionals ready to scale their impact.",
    badge: "For growing practices",
  },
  {
    key: "UNLIMITED",
    name: "Pro",
    price: "$197",
    clients: "31 – 150 active clients",
    blurb: "For established professionals with larger client rosters.",
  },
];

const TRAINER_INCLUDES = [
  "Program builder + full exercise library",
  "AI-assisted program generation",
  "Progress tracking and messaging",
];

const CLUB_BENEFITS = [
  {
    icon: Layers,
    title: "On-demand exercise library",
    description: "Hundreds of expert-led workouts for golf, tennis, strength, mobility, recovery and more.",
  },
  {
    icon: UserRound,
    title: "Personalized programs",
    description: "Structured programs tailored to each member's goals, equipment, and ability level.",
  },
  {
    icon: BarChart3,
    title: "Progress tracking",
    description: "Workout tracking, performance insights, and milestones keep members motivated.",
  },
  {
    icon: Heart,
    title: "Year-round wellness",
    description: "Help members move better, feel better, and stay engaged all year.",
  },
  {
    icon: Users,
    title: "Easy for your team",
    description: "Simple setup, seamless integration, and support from our team.",
  },
  {
    icon: Shield,
    title: "No cost to your club",
    description: "Provide immediate value to members with zero upfront cost.",
  },
];

const INDIVIDUAL_STARTER = [
  "Access to the MIA Performance individual training platform",
  "Exercise programming through the app",
];

const INDIVIDUAL_ADVANCED = [
  "One-on-one meeting with a Doctor of Physical Therapy",
  "Customized exercise programming tailored to your specific needs and goals",
  "No cookie-cutter workouts or generic exercise plans",
  "Personalized guidance focused on improving strength, mobility, recovery, and overall performance",
  "Progressive programming adjusted throughout the 3-month program based on your progress",
];

/* ── Shared bits ───────────────────────────────────────────────────────── */

function CheckList({ items, tone = "light" }: { items: string[]; tone?: "light" | "dark" }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-sm leading-relaxed">
          <Check
            className={cn("mt-0.5 h-4 w-4 shrink-0", tone === "dark" ? "text-ember" : "text-clay")}
            strokeWidth={2.2}
            aria-hidden
          />
          <span className={tone === "dark" ? "text-cream/85" : "text-ink-soft"}>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Price({ amount, unit = "/ month", tone = "light" }: { amount: string; unit?: string; tone?: "light" | "dark" }) {
  return (
    <p className="mt-3 flex items-baseline gap-1.5">
      <span className="text-4xl font-medium tracking-[-0.03em]">{amount}</span>
      <span className={cn("text-sm", tone === "dark" ? "text-cream/70" : "text-ink-soft")}>{unit}</span>
    </p>
  );
}

/* ── Panels ────────────────────────────────────────────────────────────── */

function ClubsPanel() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <div className="rounded-3xl border border-sand-line bg-white/60 p-6 sm:p-8">
        <Eyebrow>Country Club Partnership</Eyebrow>
        <h3 className="mt-3 text-3xl font-normal tracking-[-0.02em] text-ink sm:text-4xl">
          Elevate your member experience.
        </h3>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-ink-soft">
          Give your members an on-demand exercise library, personalized programs, and expert guidance from a Doctor of
          Physical Therapy — at no cost to your club. Every partnership is set up around your club, so we start with a
          conversation.
        </p>
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {CLUB_BENEFITS.map((b) => (
            <div key={b.title} className="flex gap-3.5">
              <IconTile icon={b.icon} />
              <div>
                <p className="text-sm font-medium text-ink">{b.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">{b.description}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
          <PillLink href={CALENDLY_URL}>Schedule a consultation</PillLink>
          <p className="text-sm text-ink-soft">A short call to see if MIA is right for your members.</p>
        </div>
      </div>
      <div className="relative hidden min-h-[22rem] overflow-hidden rounded-3xl border border-sand-line bg-cream-deep lg:block">
        <Image
          src="/landing/clubs-cta.jpg"
          alt="A club terrace overlooking a golf course at sunset"
          fill
          sizes="40vw"
          className="object-cover"
        />
      </div>
    </div>
  );
}

function TrainersPanel() {
  return (
    <div>
      <div className="grid gap-3 md:grid-cols-3">
        {TRAINER_PLANS.map((p) => {
          const featured = Boolean(p.badge);
          return (
            <div
              key={p.key}
              className={cn(
                "relative flex flex-col rounded-3xl border p-6 sm:p-7",
                featured ? "border-clay bg-cream-deep shadow-lg shadow-ink/5" : "border-sand-line bg-white/60",
              )}
            >
              {p.badge && (
                <span className="absolute top-5 right-5 rounded-full bg-sand px-3 py-1 text-[11px] text-ink">
                  {p.badge}
                </span>
              )}
              <h3 className="text-2xl font-normal tracking-[-0.02em] text-ink">{p.name}</h3>
              <Price amount={p.price} />
              <p className="mt-4 text-base font-medium text-ink">{p.clients}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">{p.blurb}</p>
              <div className="mt-6 mb-7 border-t border-sand-line pt-5">
                <CheckList items={TRAINER_INCLUDES} />
              </div>
              <PillLink
                href={trainerTrialHref(p.key)}
                variant={featured ? "dark" : "light"}
                className="mt-auto w-full"
              >
                Start 7-day free trial
              </PillLink>
            </div>
          );
        })}
      </div>
      <div className="mt-6 grid gap-3 text-sm leading-relaxed text-ink-soft sm:grid-cols-2">
        <p>7-day free trial. Card required; cancel anytime before it ends and you won&apos;t be charged.</p>
        <p className="flex gap-2 sm:justify-self-end">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-clay" aria-hidden />
          AI usage is included with every plan, with an allowance set per plan.
        </p>
      </div>
    </div>
  );
}

function IndividualsPanel() {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
      <div className="flex flex-col rounded-3xl border border-sand-line bg-white/60 p-6 sm:p-8">
        <Eyebrow>Starter</Eyebrow>
        <h3 className="mt-3 text-2xl font-normal tracking-[-0.02em] text-ink">Train with MIA on your own schedule.</h3>
        <Price amount="$39.99" />
        <div className="mt-6 mb-8 border-t border-sand-line pt-5">
          <CheckList items={INDIVIDUAL_STARTER} />
        </div>
        <PillLink href={INDIVIDUAL_TRIAL_HREF} className="mt-auto w-full">
          Start 7-day free trial
        </PillLink>
        <p className="mt-4 text-xs leading-relaxed text-ink-soft">
          Card required; cancel anytime before the trial ends and you won&apos;t be charged.
        </p>
      </div>

      <div className="flex flex-col rounded-3xl bg-ink p-6 text-cream sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] font-medium tracking-[0.22em] text-cream/70 uppercase sm:text-xs">
            Advanced · 3-Month Personalized Program
          </p>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-cream/10 px-3 py-1 text-[11px] text-cream">
            <Stethoscope className="h-3.5 w-3.5" aria-hidden />
            With a Doctor of Physical Therapy
          </span>
        </div>
        <h3 className="mt-4 text-2xl font-normal tracking-[-0.02em] sm:text-3xl">
          Beyond generic workouts. <span className="text-ember">Built specifically for you.</span>
        </h3>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-cream/75 sm:text-base">
          A comprehensive 3-month program designed around your individual needs, goals, and physical abilities.
        </p>
        <p className="mt-5 text-lg font-medium">Inquire for pricing</p>
        <div className="mt-5 mb-8 border-t border-cream/15 pt-5">
          <CheckList items={INDIVIDUAL_ADVANCED} tone="dark" />
        </div>
        <a
          href={CALENDLY_URL}
          {...(CALENDLY_URL.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className="mt-auto inline-flex h-11 w-full items-center justify-center rounded-full bg-cream px-6 text-sm font-medium text-ink transition-colors hover:bg-cream-deep sm:h-12 sm:w-fit sm:px-7"
        >
          Inquire for pricing
        </a>
      </div>
    </div>
  );
}

const PANELS: Record<PricingTab, () => React.ReactElement> = {
  clubs: ClubsPanel,
  trainers: TrainersPanel,
  individuals: IndividualsPanel,
};

/* ── Tabs ──────────────────────────────────────────────────────────────── */

/**
 * Clubs | Trainers | Individuals pricing, as an accessible tablist. The
 * selected tab is mirrored into `?tab=` (history.replaceState — no server
 * round-trip, no new history entry) so the URL is always shareable.
 */
export function PricingTabs({ initialTab }: { initialTab: PricingTab }) {
  const [tab, setTab] = useState<PricingTab>(initialTab);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab");

  // Follow external URL changes (e.g. a footer link to /pricing?tab=clubs while already here).
  // Adjusting state during render (not in an effect) per react.dev "you might not need an effect".
  const [seenUrlTab, setSeenUrlTab] = useState(urlTab);
  if (urlTab !== seenUrlTab) {
    setSeenUrlTab(urlTab);
    if (urlTab !== null) setTab(parsePricingTab(urlTab));
  }

  const select = useCallback((next: PricingTab, focus = false) => {
    setTab(next);
    if (focus) tabRefs.current[next]?.focus();
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next === null) return;
    e.preventDefault();
    select(TABS[next].id, true);
  };

  const Panel = PANELS[tab];

  return (
    <div>
      <div className="flex justify-center">
        <div
          role="tablist"
          aria-label="Pricing for"
          onKeyDown={onKeyDown}
          className="inline-flex w-full max-w-md items-center gap-1 rounded-full border border-sand-line bg-white/60 p-1 sm:w-auto"
        >
          {TABS.map((t) => {
            const selected = t.id === tab;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[t.id] = el;
                }}
                type="button"
                role="tab"
                id={`pricing-tab-${t.id}`}
                aria-selected={selected}
                aria-controls={`pricing-panel-${t.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(t.id)}
                className={cn(
                  "h-10 flex-1 rounded-full px-4 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-clay focus-visible:outline-none sm:h-11 sm:flex-none sm:px-7",
                  selected ? "bg-ink text-cream" : "text-ink-soft hover:text-ink",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="tabpanel"
        id={`pricing-panel-${tab}`}
        aria-labelledby={`pricing-tab-${tab}`}
        tabIndex={0}
        className="mt-10 focus-visible:outline-none sm:mt-12"
      >
        <Panel />
      </div>
    </div>
  );
}
