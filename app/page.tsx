"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SiteNavbar } from "@/components/layout/site-navbar";
import { SiteFooter } from "@/components/layout/site-footer";
import { FadeUp, FadeIn } from "@/components/layout/scroll-reveal";
import {
  Brain,
  Users,
  MessageSquare,
  BarChart3,
  TrendingUp,
  ArrowRight,
  Dumbbell,
  Check,
  Star,
  Zap,
  Shield,
  ChevronDown,
  Play,
  Sparkles,
  Clock,
  HeartPulse,
} from "lucide-react";

// ── Animation helpers ───────────────────────────────────────────────────────

// Animated counter
function AnimatedNumber({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    const start = Date.now();
    const duration = 1800;
    const raf = requestAnimationFrame(function tick() {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [isInView, value]);

  return (
    <span ref={ref}>
      {display}
      {suffix}
    </span>
  );
}

// ── Data ────────────────────────────────────────────────────────────────────

const features = [
  {
    icon: Brain,
    title: "PT-Inspired AI Programming",
    description:
      "Our AI was designed by a Doctor of Physical Therapy to recommend appropriate exercises, progressions, regressions, and modifications based on your client's goals, experience, movement limitations, and available equipment.",
    gradient: "from-blue-500 to-indigo-500",
    bg: "bg-blue-50",
    iconColor: "text-blue-600",
  },
  {
    icon: Dumbbell,
    title: "Exercise Library",
    description:
      "A curated library of rehabilitation exercises with video instructions, progressions, regressions, and contraindication tagging.",
    gradient: "from-teal-500 to-cyan-500",
    bg: "bg-teal-50",
    iconColor: "text-teal-600",
  },
  {
    icon: Users,
    title: "Client Portal",
    description:
      "Clients access guided sessions on any device. Step-by-step instructions, video demos, and set logging — all in one place.",
    gradient: "from-violet-500 to-purple-500",
    bg: "bg-violet-50",
    iconColor: "text-violet-600",
  },
  {
    icon: MessageSquare,
    title: "Feedback & Alerts",
    description:
      "Clients rate every exercise after each session. Trainers receive instant alerts on pain or difficulty reports.",
    gradient: "from-amber-500 to-orange-500",
    bg: "bg-amber-50",
    iconColor: "text-amber-600",
  },
  {
    icon: BarChart3,
    title: "Adherence Tracking",
    description:
      "Automatic tracking of session completions, skipped exercises, and weekly compliance rates. See who needs a check-in.",
    gradient: "from-emerald-500 to-green-500",
    bg: "bg-emerald-50",
    iconColor: "text-emerald-600",
  },
  {
    icon: TrendingUp,
    title: "Outcome Monitoring",
    description:
      "Record functional assessments over time and visualise client progress with interactive charts and trend lines.",
    gradient: "from-rose-500 to-pink-500",
    bg: "bg-rose-50",
    iconColor: "text-rose-600",
  },
];

const steps = [
  {
    number: "01",
    icon: Users,
    title: "Create Client Profile",
    description:
      "Add your client and capture their health history, limitations, available equipment, and rehabilitation goals.",
    color: "from-blue-500 to-indigo-500",
  },
  {
    number: "02",
    icon: Sparkles,
    title: "Generate AI Program",
    description:
      "Select focus areas and let the AI build a personalised program from your exercise library in seconds.",
    color: "from-violet-500 to-purple-500",
  },
  {
    number: "03",
    icon: TrendingUp,
    title: "Track & Adjust",
    description:
      "Monitor adherence, review session feedback, and adjust programs in real time as your client progresses.",
    color: "from-emerald-500 to-teal-500",
  },
];

const testimonials = [
  {
    name: "Dr. Sarah Chen",
    role: "Physical Therapist",
    organization: "Motion Health Organization",
    quote:
      "INMOTUS RX cut my program creation time from 45 minutes to under 2 minutes. The AI understands contraindications and creates thoughtful progressions I would have designed myself.",
    avatar: "SC",
    gradient: "from-blue-500 to-indigo-500",
  },
  {
    name: "James Rodriguez",
    role: "Post-Surgical Client",
    organization: "",
    quote:
      "Having a guided workout on my phone with clear instructions made me actually stick with my exercises. My therapist could see my progress in real time too.",
    avatar: "JR",
    gradient: "from-violet-500 to-purple-500",
  },
  {
    name: "Dr. Emily Thompson",
    role: "Orthopedic Surgeon",
    organization: "Summit Orthopaedics",
    quote:
      "I refer clients to trainers on INMOTUS RX because I can see adherence data and outcomes. It closes the feedback loop I never had before.",
    avatar: "ET",
    gradient: "from-emerald-500 to-teal-500",
  },
];

const pricingPlans = [
  {
    name: "Starter",
    price: "Free",
    period: "",
    description: "Perfect for independent practitioners getting started",
    features: [
      "1 trainer account",
      "Up to 5 clients",
      "AI program generation",
      "Exercise library access",
      "Email support",
    ],
    cta: "Start Free",
    highlighted: false,
    badge: null,
  },
  {
    name: "Professional",
    price: "$49",
    period: "/month",
    description: "Everything you need to run a modern practice",
    features: [
      "1 trainer account",
      "Unlimited clients",
      "Full AI generation",
      "Adherence analytics",
      "Client messaging",
      "Outcome monitoring",
      "Priority support",
    ],
    cta: "Start Free Trial",
    highlighted: true,
    badge: "Most Popular",
  },
  {
    name: "Practice",
    price: "$149",
    period: "/month",
    description: "For growing multi-trainer practices",
    features: [
      "Up to 10 trainers",
      "Unlimited clients",
      "All Professional features",
      "Custom organization branding",
      "API access",
      "Dedicated account manager",
      "HIPAA BAA included",
    ],
    cta: "Contact Sales",
    highlighted: false,
    badge: null,
  },
];

const stats = [
  { value: 500, suffix: "+", label: "Trainers", icon: Users },
  { value: 10000, suffix: "+", label: "Clients", icon: HeartPulse },
  { value: 95, suffix: "%", label: "Adherence Rate", icon: TrendingUp },
  { value: 2, suffix: " min", label: "Program Generation", icon: Clock },
];

// ── Component ───────────────────────────────────────────────────────────────

export default function LandingPage() {
  const heroRef = useRef(null);

  return (
    <div className="min-h-screen overflow-x-hidden bg-white">
      <SiteNavbar />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section ref={heroRef} className="relative flex min-h-screen items-center overflow-hidden bg-[#0a0f1e] pt-16">
        {/* Animated gradient orbs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <motion.div
            className="absolute -top-40 -right-40 h-[600px] w-[600px] rounded-full bg-blue-600/20 blur-[120px]"
            animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute -bottom-40 -left-40 h-[500px] w-[500px] rounded-full bg-indigo-600/20 blur-[120px]"
            animate={{ scale: [1.1, 1, 1.1], opacity: [0.4, 0.2, 0.4] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute top-1/2 left-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/10 blur-[100px]"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          />
          {/* Subtle grid */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                "linear-gradient(to right, #6366f1 1px, transparent 1px), linear-gradient(to bottom, #6366f1 1px, transparent 1px)",
              backgroundSize: "64px 64px",
            }}
          />
        </div>

        <div className="relative mx-auto w-full max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            {/* Pill badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <Badge className="mb-8 gap-1.5 border border-blue-400/30 bg-blue-500/10 px-4 py-1.5 text-sm text-blue-300 backdrop-blur-sm hover:bg-blue-500/20">
                <Zap className="h-3.5 w-3.5 fill-current" />
                PT-Inspired Exercise Intelligence
              </Badge>
            </motion.div>

            {/* Headline */}
            <motion.h1
              className="text-5xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-6xl lg:text-7xl"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              Smarter Programming{" "}
              <span className="relative">
                <span className="bg-linear-to-r from-blue-300 via-cyan-300 to-teal-300 bg-clip-text text-transparent">
                  Starts Here.
                </span>
              </span>
            </motion.h1>

            {/* Subheading */}
            <motion.p
              className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-400 sm:text-xl"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.5 }}
            >
              Built by a Doctor of Physical Therapy to help personal trainers create safer,
              more personalized programs in minutes using AI-powered exercise intelligence.
            </motion.p>

            {/* CTA buttons */}
            <motion.div
              className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.65 }}
            >
              <Button
                size="lg"
                className="h-13 gap-2 bg-linear-to-r from-blue-500 to-indigo-500 border-0 px-8 text-base font-semibold text-white shadow-xl shadow-blue-500/30 hover:from-blue-600 hover:to-indigo-600 hover:shadow-blue-500/40 transition-all"
                asChild
              >
                <Link href="/sign-up">
                  Start for Free
                  <ArrowRight className="h-4.5 w-4.5" />
                </Link>
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="h-13 gap-2 border-white/20 bg-white/5 px-8 text-base text-slate-200 backdrop-blur-sm hover:border-white/40 hover:bg-white/10 hover:text-white"
                asChild
              >
                <Link href="/sign-in">
                  <Play className="h-4 w-4 fill-current" />
                  Watch Demo
                </Link>
              </Button>
            </motion.div>

            {/* Trust row */}
            <motion.div
              className="mt-10 flex flex-wrap items-center justify-center gap-6 text-sm text-slate-500"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.8 }}
            >
              {[
                { icon: Shield, label: "HIPAA Compliant" },
                { icon: Check, label: "No credit card required" },
                { icon: Users, label: "500+ trainers" },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <Icon className="h-4 w-4 text-emerald-400" />
                  <span>{label}</span>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Dashboard mockup */}
          <motion.div
            className="mx-auto mt-20 max-w-5xl"
            initial={{ opacity: 0, y: 60, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.9, delay: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="relative rounded-2xl border border-white/10 bg-white/5 p-2 shadow-2xl backdrop-blur-sm">
              {/* Glow */}
              <div className="absolute inset-0 rounded-2xl bg-linear-to-br from-blue-500/10 via-transparent to-indigo-500/10" />
              <div className="relative rounded-xl bg-[#f8fafc] p-4 sm:p-6 shadow-inner">
                {/* Window chrome */}
                <div className="mb-5 flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-red-400/80" />
                  <div className="h-3 w-3 rounded-full bg-amber-400/80" />
                  <div className="h-3 w-3 rounded-full bg-green-400/80" />
                  <div className="ml-4 h-5 w-56 rounded-md bg-slate-200" />
                </div>
                {/* App content preview */}
                <div className="grid gap-4 sm:grid-cols-4">
                  {[
                    { label: "Active Clients", value: "127", change: "+12 this week", color: "blue" },
                    { label: "Active Programs", value: "342", change: "+28 this week", color: "emerald" },
                    { label: "Adherence Rate", value: "94%", change: "+3% vs last month", color: "violet" },
                    { label: "Pending Feedback", value: "8", change: "3 need attention", color: "amber" },
                  ].map((card, i) => (
                    <motion.div
                      key={card.label}
                      className={`rounded-xl p-5 ${
                        card.color === "blue" ? "bg-linear-to-br from-blue-50 to-indigo-50" :
                        card.color === "emerald" ? "bg-linear-to-br from-emerald-50 to-teal-50" :
                        card.color === "violet" ? "bg-linear-to-br from-violet-50 to-purple-50" :
                        "bg-linear-to-br from-amber-50 to-orange-50"
                      }`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: 0.9 + i * 0.1 }}
                    >
                      <p className={`text-xs font-medium ${
                        card.color === "blue" ? "text-blue-600" :
                        card.color === "emerald" ? "text-emerald-600" :
                        card.color === "violet" ? "text-violet-600" :
                        "text-amber-600"
                      }`}>{card.label}</p>
                      <p className="mt-2 text-3xl font-bold text-slate-800">{card.value}</p>
                      <p className="mt-1 text-xs text-emerald-600">{card.change}</p>
                    </motion.div>
                  ))}
                </div>
                {/* Mock session list */}
                <div className="mt-4 space-y-2">
                  {[
                    { name: "Maria Santos", program: "Shoulder Rehab Protocol", date: "Today, 2:00 PM", status: "Scheduled", statusColor: "blue" },
                    { name: "John Park", program: "Knee Strengthening", date: "Today, 4:00 PM", status: "Completed", statusColor: "green" },
                  ].map((s, i) => (
                    <motion.div
                      key={s.name}
                      className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-4 py-3"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.4, delay: 1.1 + i * 0.1 }}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`h-8 w-8 rounded-full bg-linear-to-br ${i === 0 ? "from-blue-400 to-indigo-500" : "from-violet-400 to-purple-500"} flex items-center justify-center text-xs font-bold text-white`}>
                          {s.name.split(" ").map(n => n[0]).join("")}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-800">{s.name}</p>
                          <p className="text-xs text-slate-500">{s.program}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400">{s.date}</span>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${s.statusColor === "blue" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                          {s.status}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Scroll indicator */}
          <motion.div
            className="absolute bottom-10 left-1/2 -translate-x-1/2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.4 }}
          >
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              className="flex flex-col items-center gap-1 text-slate-500"
            >
              <span className="text-xs tracking-widest uppercase">Scroll</span>
              <ChevronDown className="h-4 w-4" />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      <section className="border-y border-slate-100 bg-white py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {stats.map(({ value, suffix, label, icon: Icon }, i) => (
              <FadeUp key={label} delay={i * 0.1} className="text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <p className="text-4xl font-extrabold tracking-tight text-slate-900">
                  <AnimatedNumber value={value} suffix={suffix} />
                </p>
                <p className="mt-1 text-sm font-medium text-slate-500">{label}</p>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────────── */}
      <section id="features" className="py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <FadeUp className="mx-auto max-w-2xl text-center">
            <Badge className="mb-4 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100">
              Platform Features
            </Badge>
            <h2 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
              Everything your practice needs
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              A complete platform for creating, assigning, and monitoring home exercise programs.
            </p>
          </FadeUp>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <FadeUp key={feature.title} delay={i * 0.08}>
                  <div className="group relative h-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-8 transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-xl">
                    <div className={`mb-5 inline-flex rounded-xl bg-linear-to-br ${feature.gradient} p-3 text-white shadow-lg`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className="mb-3 text-xl font-semibold text-slate-900">{feature.title}</h3>
                    <p className="text-sm leading-relaxed text-slate-600">{feature.description}</p>
                    {/* Hover gradient shine */}
                    <div className={`absolute inset-0 rounded-2xl bg-linear-to-br ${feature.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-[0.03]`} />
                  </div>
                </FadeUp>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── How it Works ──────────────────────────────────────────────────── */}
      <section id="how-it-works" className="relative overflow-hidden bg-slate-950 py-24 sm:py-32">
        {/* Background glow */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-0 left-1/4 h-96 w-96 rounded-full bg-blue-600/10 blur-[120px]" />
          <div className="absolute bottom-0 right-1/4 h-96 w-96 rounded-full bg-indigo-600/10 blur-[120px]" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <FadeUp className="mx-auto max-w-2xl text-center">
            <Badge className="mb-4 border-emerald-400/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20">
              Simple Process
            </Badge>
            <h2 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              Live in 3 steps
            </h2>
            <p className="mt-4 text-lg text-slate-400">
              From client intake to guided sessions in minutes.
            </p>
          </FadeUp>

          <div className="relative mt-20 grid gap-8 lg:grid-cols-3">
            {/* Connector line */}
            <div className="absolute top-14 left-0 right-0 hidden h-px bg-linear-to-r from-transparent via-white/10 to-transparent lg:block" />

            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <FadeUp key={step.number} delay={i * 0.15}>
                  <div className="relative flex flex-col items-center text-center">
                    <div className={`relative mb-6 flex h-28 w-28 items-center justify-center rounded-3xl bg-linear-to-br ${step.color} shadow-2xl`}>
                      <Icon className="h-10 w-10 text-white" />
                      <div className="absolute -top-3 -right-3 flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-900 shadow-lg">
                        {step.number}
                      </div>
                    </div>
                    <h3 className="mb-3 text-xl font-bold text-white">{step.title}</h3>
                    <p className="text-sm leading-relaxed text-slate-400">{step.description}</p>
                  </div>
                </FadeUp>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Testimonials ──────────────────────────────────────────────────── */}
      <section className="py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <FadeUp className="mx-auto max-w-2xl text-center">
            <Badge className="mb-4 border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100">
              Testimonials
            </Badge>
            <h2 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
              Trusted by healthcare professionals
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              See what trainers and clients say about INMOTUS RX.
            </p>
          </FadeUp>

          <div className="mt-16 grid gap-8 lg:grid-cols-3">
            {testimonials.map((t, i) => (
              <FadeUp key={t.name} delay={i * 0.12}>
                <div className="group relative flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-8 transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-xl">
                  {/* Stars */}
                  <div className="mb-5 flex gap-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} className="h-4 w-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>

                  <p className="flex-1 text-base leading-relaxed text-slate-600">
                    &ldquo;{t.quote}&rdquo;
                  </p>

                  <div className="mt-8 flex items-center gap-4">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-linear-to-br ${t.gradient} text-sm font-bold text-white shadow-md`}>
                      {t.avatar}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{t.name}</p>
                      <p className="text-sm text-slate-500">{t.role}{t.organization ? ` · ${t.organization}` : ""}</p>
                    </div>
                  </div>

                  {/* Hover accent line */}
                  <div className={`absolute bottom-0 left-8 right-8 h-0.5 rounded-full bg-linear-to-r ${t.gradient} scale-x-0 transition-transform duration-300 group-hover:scale-x-100`} />
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────────────────────────────── */}
      {/* <section id="pricing" className="bg-slate-50 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <FadeUp className="mx-auto max-w-2xl text-center">
            <Badge className="mb-4 border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100">
              Pricing
            </Badge>
            <h2 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              Start free. Upgrade when you are ready. Cancel anytime.
            </p>
          </FadeUp>

          <div className="mt-16 grid gap-8 lg:grid-cols-3">
            {pricingPlans.map((plan, i) => (
              <FadeUp key={plan.name} delay={i * 0.1}>
                <div
                  className={`relative flex h-full flex-col rounded-2xl border p-8 transition-all duration-300 hover:-translate-y-1 ${
                    plan.highlighted
                      ? "border-blue-500 bg-linear-to-b from-blue-600 to-indigo-600 text-white shadow-2xl shadow-blue-500/25"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-xl"
                  }`}
                >
                  {plan.badge && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                      <span className="rounded-full bg-amber-400 px-4 py-1 text-xs font-bold text-amber-900 shadow-lg">
                        {plan.badge}
                      </span>
                    </div>
                  )}

                  <div className="mb-6">
                    <h3 className={`text-xl font-bold ${plan.highlighted ? "text-white" : "text-slate-900"}`}>
                      {plan.name}
                    </h3>
                    <div className="mt-3 flex items-end gap-1">
                      <span className={`text-5xl font-extrabold ${plan.highlighted ? "text-white" : "text-slate-900"}`}>
                        {plan.price}
                      </span>
                      {plan.period && (
                        <span className={`mb-1 text-sm ${plan.highlighted ? "text-blue-200" : "text-slate-500"}`}>
                          {plan.period}
                        </span>
                      )}
                    </div>
                    <p className={`mt-2 text-sm ${plan.highlighted ? "text-blue-200" : "text-slate-600"}`}>
                      {plan.description}
                    </p>
                  </div>

                  <ul className="mb-8 flex-1 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-3 text-sm">
                        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${plan.highlighted ? "bg-white/20" : "bg-emerald-100"}`}>
                          <Check className={`h-3 w-3 ${plan.highlighted ? "text-white" : "text-emerald-600"}`} />
                        </div>
                        <span className={plan.highlighted ? "text-blue-100" : "text-slate-600"}>
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    className={`w-full font-semibold ${
                      plan.highlighted
                        ? "bg-white text-blue-700 hover:bg-blue-50 border-0"
                        : "bg-linear-to-r from-blue-500 to-indigo-500 text-white border-0 hover:from-blue-600 hover:to-indigo-600"
                    }`}
                    size="lg"
                    asChild
                  >
                    <Link href="/sign-up">{plan.cta}</Link>
                  </Button>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section> */}

      {/* ── CTA Banner ────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#0a0f1e] py-24">
        {/* Animated orbs */}
        <div className="pointer-events-none absolute inset-0">
          <motion.div
            className="absolute -top-20 left-1/3 h-64 w-64 rounded-full bg-blue-500/20 blur-[80px]"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 6, repeat: Infinity }}
          />
          <motion.div
            className="absolute -bottom-20 right-1/3 h-64 w-64 rounded-full bg-indigo-500/20 blur-[80px]"
            animate={{ scale: [1.2, 1, 1.2] }}
            transition={{ duration: 8, repeat: Infinity }}
          />
        </div>
        <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <FadeUp>
            <h2 className="text-4xl font-extrabold text-white sm:text-5xl">
              Ready to transform client care?
            </h2>
            <p className="mt-4 text-lg text-slate-400">
              Join hundreds of trainers using AI to build better exercise programs.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button
                size="lg"
                className="h-13 gap-2 bg-linear-to-r from-blue-500 to-indigo-500 border-0 px-10 text-base font-semibold text-white shadow-xl shadow-blue-500/30 hover:from-blue-600 hover:to-indigo-600"
                asChild
              >
                <Link href="/sign-up">
                  Get Started for Free
                  <ArrowRight className="h-4.5 w-4.5" />
                </Link>
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="h-13 border-white/20 bg-white/5 px-10 text-base text-slate-200 hover:border-white/40 hover:bg-white/10 hover:text-white"
                asChild
              >
                <Link href="/sign-in">Sign In</Link>
              </Button>
            </div>
          </FadeUp>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
