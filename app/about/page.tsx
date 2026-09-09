"use client";

import { SiteNavbar } from "@/components/layout/site-navbar";
import { SiteFooter } from "@/components/layout/site-footer";
import { FadeUp } from "@/components/layout/scroll-reveal";
import { Badge } from "@/components/ui/badge";
import { Check, X } from "lucide-react";

const COMPARISON_ROWS = [
  { theirs: "Workout builder", ours: "PT-designed programming assistant" },
  { theirs: "Generic AI", ours: "PT-informed AI" },
  { theirs: "Exercise list", ours: "Intelligent exercise recommendations" },
  { theirs: "Manual progressions", ours: "Automatic progressions & regressions" },
  { theirs: "Basic client tracking", ours: "Coaching insights & adherence tracking" },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-white">
      <SiteNavbar alwaysSolid />

      <div className="pt-32 pb-8">
        {/* ── Why We're Different ────────────────────────────────────────── */}
        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <FadeUp className="mx-auto max-w-2xl text-center">
              <Badge className="mb-4 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100">
                About
              </Badge>
              <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
                Why INMOTUS RX Is Different
              </h1>
              <div className="mt-6 space-y-4 text-left text-lg leading-8 text-slate-600">
                <p>Most workout apps were built by software companies.</p>
                <p>
                  INMOTUS RX was built by a Doctor of Physical Therapy who has spent years
                  helping thousands of people improve movement, recover from injuries, and
                  perform at a higher level.
                </p>
                <p>
                  We took the clinical reasoning used by movement experts and combined it with
                  AI to help trainers build smarter exercise programs—without spending hours
                  creating them.
                </p>
                <p>The result is better programming, happier clients, and more confident coaching.</p>
              </div>
            </FadeUp>
          </div>
        </section>

        {/* ── Credibility ───────────────────────────────────────────────── */}
        <section className="bg-slate-50 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <FadeUp className="mx-auto max-w-2xl text-center">
              <Badge className="mb-4 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
                Credibility
              </Badge>
              <h2 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
                Designed by a Doctor of Physical Therapy
              </h2>
              <div className="mt-6 space-y-4 text-left text-lg leading-8 text-slate-600">
                <p>
                  Unlike generic workout builders, INMOTUS RX was created by a practicing
                  Doctor of Physical Therapy with years of experience in movement science,
                  biomechanics, rehabilitation, and performance training.
                </p>
                <p>
                  Our AI reflects the same decision-making process used to build
                  individualized exercise programs—adapted specifically for personal trainers.
                </p>
              </div>
            </FadeUp>
          </div>
        </section>

        {/* ── Comparison ────────────────────────────────────────────────── */}
        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <FadeUp className="mx-auto max-w-2xl text-center">
              <h2 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
                See the difference
              </h2>
            </FadeUp>

            <FadeUp delay={0.1} className="mt-12 overflow-hidden rounded-2xl border border-slate-200">
              <div className="grid grid-cols-2">
                <div className="border-b border-slate-200 bg-slate-50 px-3 py-4 text-center text-sm font-semibold text-slate-500 sm:px-6">
                  Other Training Apps
                </div>
                <div className="border-b border-slate-200 bg-linear-to-r from-blue-500 to-indigo-500 px-3 py-4 text-center text-sm font-semibold text-white sm:px-6">
                  INMOTUS RX
                </div>
              </div>
              {COMPARISON_ROWS.map((row, i) => (
                <div
                  key={row.theirs}
                  className={`grid grid-cols-2 ${i !== COMPARISON_ROWS.length - 1 ? "border-b border-slate-100" : ""}`}
                >
                  <div className="flex items-center gap-2 px-3 py-4 text-slate-500 sm:gap-3 sm:px-6">
                    <X className="h-4 w-4 shrink-0 text-slate-300" />
                    <span className="text-sm">{row.theirs}</span>
                  </div>
                  <div className="flex items-center gap-2 bg-blue-50/50 px-3 py-4 text-slate-900 sm:gap-3 sm:px-6">
                    <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span className="text-sm font-medium">{row.ours}</span>
                  </div>
                </div>
              ))}
            </FadeUp>
          </div>
        </section>

        {/* ── Meet the Founder ──────────────────────────────────────────── */}
        <section className="bg-slate-50 py-16 sm:py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <FadeUp className="mx-auto max-w-2xl text-center">
              <Badge className="mb-4 border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100">
                Meet the Founder
              </Badge>
            </FadeUp>

            <FadeUp delay={0.1}>
              <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
                <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:items-start sm:text-left">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-violet-500 to-purple-500 text-lg font-bold text-white shadow-md">
                    SA
                  </div>
                  <div>
                    <p className="text-xl font-bold text-slate-900">Dr. Sharon Ackerman, PT, DPT</p>
                    <p className="text-sm text-slate-500">Founder of INMOTUS RX</p>
                    <div className="mt-6 space-y-4 text-base leading-relaxed text-slate-600">
                      <p>
                        After years of helping clients recover, move better, and perform at a
                        higher level, I realized personal trainers needed better tools—not more
                        complicated software.
                      </p>
                      <p>
                        I built INMOTUS RX to bring the thought process of a movement expert
                        into an AI-powered platform that helps trainers create better programs
                        faster.
                      </p>
                      <p className="font-medium text-slate-900">
                        Because great coaching starts with great programming.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </FadeUp>
          </div>
        </section>
      </div>

      <SiteFooter />
    </div>
  );
}
