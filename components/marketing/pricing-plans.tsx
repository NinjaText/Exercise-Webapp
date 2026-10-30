"use client";

import { useState } from "react";
import { DisplayHeading, Eyebrow, PillLink, SIGN_UP_HREF } from "@/components/marketing/primitives";
import { cn } from "@/lib/utils";

const ANNUAL_DISCOUNT = 0.2;

const PLANS = [
  { name: "Starter", monthly: 39.99, clients: "0 – 5 clients", blurb: "For independent professionals getting started." },
  {
    name: "Growth",
    monthly: 59.99,
    clients: "6 – 30 clients",
    blurb: "For professionals ready to scale their impact.",
    badge: "For growing practices",
  },
  { name: "Pro", monthly: 197, clients: "31 – 150 clients", blurb: "For established professionals with larger client rosters." },
];

function formatPrice(n: number) {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

export function PricingPlans() {
  const [annual, setAnnual] = useState(false);

  return (
    <>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Eyebrow>Simple, flexible pricing</Eyebrow>
          <DisplayHeading className="mt-3">
            Choose the plan that
            <br />
            fits your practice.
          </DisplayHeading>
        </div>
        <div className="inline-flex w-fit items-center gap-1 rounded-full border border-sand-line bg-white/60 p-1" role="group" aria-label="Billing period">
          {[
            { label: "Monthly", value: false },
            { label: "Annual", value: true },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              aria-pressed={annual === o.value}
              onClick={() => setAnnual(o.value)}
              className={cn(
                "flex h-10 items-center gap-2 rounded-full px-5 text-sm transition-colors",
                annual === o.value ? "bg-ink text-cream" : "text-ink-soft hover:text-ink",
              )}
            >
              {o.label}
              {o.value && (
                <span className={cn("rounded-full px-2 py-0.5 text-[11px]", annual ? "bg-cream/20" : "bg-sand text-ink")}>
                  Save 20%
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-3 md:grid-cols-3">
        {PLANS.map((p) => {
          const featured = Boolean(p.badge);
          const price = annual ? Math.round(p.monthly * (1 - ANNUAL_DISCOUNT) * 100) / 100 : p.monthly;
          return (
            <div
              key={p.name}
              className={cn(
                "relative flex flex-col rounded-2xl border p-6 sm:p-7",
                featured ? "border-clay bg-cream-deep shadow-lg shadow-ink/5" : "border-sand-line bg-white/60",
              )}
            >
              {p.badge && (
                <span className="absolute top-4 right-4 rounded-full bg-sand px-3 py-1 text-[11px] text-ink">
                  {p.badge}
                </span>
              )}
              <h3 className="text-2xl font-normal tracking-[-0.02em]">{p.name}</h3>
              <p className="mt-2 flex items-baseline gap-1.5">
                <span className="text-3xl font-medium tracking-[-0.02em]">{formatPrice(price)}</span>
                <span className="text-sm text-ink-soft">/ month</span>
              </p>
              {annual && <p className="text-xs text-ink-soft">billed annually</p>}
              <p className="mt-3 text-base font-medium">{p.clients}</p>
              <p className="mt-1 mb-6 text-sm leading-relaxed text-ink-soft">{p.blurb}</p>
              <PillLink href={SIGN_UP_HREF} variant={featured ? "dark" : "light"} className="mt-auto w-full">
                Start free trial
              </PillLink>
            </div>
          );
        })}
      </div>
    </>
  );
}
