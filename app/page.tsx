"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SiteNavbar } from "@/components/layout/site-navbar";
import { SiteFooter } from "@/components/layout/site-footer";
import { FadeUp } from "@/components/layout/scroll-reveal";
import {
  ArrowRight,
  Dumbbell,
  Check,
  Play,
  Sparkles,
  Clock,
  Stethoscope,
  Users,
  ShieldCheck,
  Pencil,
  FileText,
  ClipboardList,
  Smartphone,
  BarChart3,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Quote,
} from "lucide-react";

// ── Data ────────────────────────────────────────────────────────────────────

const heroTrust = ["No credit card required", "Cancel anytime", "HIPAA-ready"];

const mockFields = [
  { label: "Client Goal", value: "Return to golf" },
  { label: "Current Issues", value: "Low back pain" },
  { label: "Limitations / Precautions", value: "Avoid jumping, plyometrics" },
  { label: "Equipment", value: "Dumbbells, resistance bands" },
  { label: "Frequency", value: "3 sessions per week" },
];

const mockExercises = [
  { name: "90/90 Hip Rotation", dose: "2 x 8 reps" },
  { name: "Glute Bridge", dose: "3 x 12 reps" },
  { name: "Split Squat", dose: "3 x 8 reps each" },
  { name: "Single Arm Row", dose: "3 x 10 reps each" },
];

const valueProps = [
  { icon: Stethoscope, title: "Built by a Doctor", detail: "of Physical Therapy" },
  { icon: Users, title: "Designed for physical therapists,", detail: "trainers, and performance professionals" },
  { icon: Clock, title: "Programs", detail: "in minutes" },
  { icon: ShieldCheck, title: "You're always in control.", detail: "Review, edit and personalize." },
];

const creationPaths = [
  {
    icon: Sparkles,
    title: "Generate a Program",
    badge: "AI-assisted",
    description:
      "Enter your client's goals, limitations, precautions, equipment, and preferences. Get a personalized starting point in seconds.",
    gradient: "from-blue-500 to-indigo-500",
  },
  {
    icon: Pencil,
    title: "Build Manually",
    badge: null,
    description: "Use our exercise library, templates, or create from scratch.",
    gradient: "from-violet-500 to-purple-500",
  },
  {
    icon: FileText,
    title: "Upload a Program",
    badge: null,
    description: "Turn a PDF, Word doc, or existing plan into a structured program.",
    gradient: "from-emerald-500 to-teal-500",
  },
];

const platformFeatures = [
  { icon: Dumbbell, title: "Exercise Library", description: "Hundreds of exercises with videos and cues." },
  { icon: ClipboardList, title: "Templates", description: "Save time with pre-built programs." },
  { icon: Smartphone, title: "Client App", description: "A seamless experience for your clients." },
  { icon: BarChart3, title: "Tracking & Insights", description: "Monitor adherence, pain/difficulty, and progress." },
  { icon: MessageSquare, title: "Messaging", description: "Stay connected with built-in messaging." },
];

const testimonials = [
  {
    name: "Dr. Amanda Lee, DPT",
    role: "Physical Therapist",
    quote: "Inmotus saves me hours each week and helps me create better programs for my patients.",
    avatar: "AL",
    gradient: "from-blue-500 to-indigo-500",
  },
  {
    name: "Dr. Sarah Chen",
    role: "Physical Therapist · Motion Health Organization",
    quote:
      "INMOTUS RX cut my program creation time from 45 minutes to under 2 minutes. The AI understands contraindications and creates thoughtful progressions I would have designed myself.",
    avatar: "SC",
    gradient: "from-violet-500 to-purple-500",
  },
  {
    name: "Dr. Emily Thompson",
    role: "Orthopedic Surgeon · Summit Orthopaedics",
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

// ── Hero mockup ─────────────────────────────────────────────────────────────

/** Static preview of the Create Program screen: client info in, Week 1 out. */
function CreateProgramMockup() {
  return (
    <div className="relative rounded-2xl border border-white/10 bg-white/5 p-2 shadow-2xl backdrop-blur-sm">
      <div className="absolute inset-0 rounded-2xl bg-linear-to-br from-blue-500/10 via-transparent to-indigo-500/10" />
      <div className="relative overflow-hidden rounded-xl bg-[#f8fafc] shadow-inner">
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
          <div className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
          <div className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
          <div className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
          <p className="ml-3 text-sm font-semibold text-slate-800">Create Program</p>
        </div>

        <div className="grid gap-4 p-4 sm:grid-cols-[1.15fr_1fr] sm:p-5">
          {/* Client input */}
          <div>
            <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 text-[11px] font-medium">
              <span className="flex-1 rounded-md bg-white py-1 text-center text-blue-600 shadow-sm">Generate</span>
              <span className="flex-1 py-1 text-center text-slate-500">Manual Build</span>
              <span className="flex-1 py-1 text-center text-slate-500">Upload</span>
            </div>
            <div className="space-y-2">
              {mockFields.map((field, i) => (
                <motion.div
                  key={field.label}
                  className="grid grid-cols-[92px_1fr] items-center gap-2"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.9 + i * 0.08 }}
                >
                  <span className="text-[10px] leading-tight text-slate-500">{field.label}</span>
                  <span className="truncate rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700">
                    {field.value}
                  </span>
                </motion.div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-center gap-1.5 rounded-lg bg-[#0a0f1e] py-2 text-[11px] font-semibold text-white">
              <Sparkles className="h-3 w-3" />
              Generate Program
            </div>
          </div>

          {/* Program preview */}
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold text-slate-800">Program Preview</p>
              <span className="flex items-center gap-1 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500">
                Week 1 <ChevronDown className="h-2.5 w-2.5" />
              </span>
            </div>
            <p className="mb-2 text-[11px] font-semibold text-slate-700">Day 1</p>
            <div className="space-y-2">
              {mockExercises.map((ex, i) => (
                <motion.div
                  key={ex.name}
                  className="flex items-center gap-2.5"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 1.4 + i * 0.12 }}
                >
                  <div className="flex h-8 w-10 shrink-0 items-center justify-center rounded-md bg-linear-to-br from-slate-100 to-slate-200">
                    <Dumbbell className="h-3.5 w-3.5 text-slate-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-medium text-slate-800">{ex.name}</p>
                    <p className="text-[10px] text-slate-500">{ex.dose}</p>
                  </div>
                </motion.div>
              ))}
            </div>
            <p className="mt-3 flex items-center gap-1 text-[10px] font-medium text-blue-600">
              View Full Program <ArrowRight className="h-2.5 w-2.5" />
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Testimonial carousel ────────────────────────────────────────────────────

function TestimonialCarousel() {
  const [index, setIndex] = useState(0);
  const t = testimonials[index];
  const go = (delta: number) => setIndex((i) => (i + delta + testimonials.length) % testimonials.length);

  return (
    <div>
      <div className="flex items-center gap-3 sm:gap-5">
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Previous testimonial"
          className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 sm:flex"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="relative min-h-[220px] flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <AnimatePresence mode="wait">
            <motion.div
              key={t.name}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col gap-6 sm:flex-row sm:items-center"
            >
              <div className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br ${t.gradient} text-xl font-bold text-white shadow-md`}>
                {t.avatar}
              </div>
              <div>
                <Quote className="mb-2 h-5 w-5 text-slate-300" />
                <p className="text-lg leading-relaxed text-slate-700">&ldquo;{t.quote}&rdquo;</p>
                <p className="mt-4 font-semibold text-slate-900">{t.name}</p>
                <p className="text-sm text-slate-500">{t.role}</p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Next testimonial"
          className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 sm:flex"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-6 flex justify-center gap-2">
        {testimonials.map((item, i) => (
          <button
            key={item.name}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Show testimonial ${i + 1}`}
            aria-current={i === index}
            className={`h-2 rounded-full transition-all ${i === index ? "w-6 bg-slate-800" : "w-2 bg-slate-300 hover:bg-slate-400"}`}
          />
        ))}
      </div>
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-white">
      <SiteNavbar />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#0a0f1e] pt-16">
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

        <div className="relative mx-auto grid w-full max-w-7xl items-center gap-14 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[1fr_1.1fr] lg:px-8">
          {/* Copy */}
          <div>
            <motion.p
              className="mb-6 text-xs font-semibold tracking-[0.2em] text-blue-300 uppercase"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              Exercise Programming for Professionals
            </motion.p>

            <motion.h1
              className="text-5xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              Build Better Exercise Programs.
              <span className="block bg-linear-to-r from-blue-300 via-cyan-300 to-teal-300 bg-clip-text text-transparent">
                In Minutes.
              </span>
            </motion.h1>

            <motion.p
              className="mt-6 max-w-xl text-lg leading-8 text-slate-400"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.5 }}
            >
              Create personalized programs from client goals, limitations, precautions, and available
              equipment — or build manually and upload existing programs.
            </motion.p>

            <motion.p
              className="mt-4 font-semibold text-slate-200"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.6 }}
            >
              Developed by a Doctor of Physical Therapy.
            </motion.p>

            <motion.div
              className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center"
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
                  Start Free
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
                  Watch 60-Second Demo
                </Link>
              </Button>
            </motion.div>

            <motion.div
              className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-500"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.8 }}
            >
              {heroTrust.map((label) => (
                <div key={label} className="flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-emerald-400" />
                  <span>{label}</span>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Product preview */}
          <motion.div
            initial={{ opacity: 0, y: 60, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.9, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="mb-3 text-right text-sm italic text-slate-400">
              Turn client information into a structured program in seconds.
            </p>
            <CreateProgramMockup />
          </motion.div>
        </div>
      </section>

      {/* ── Value props ───────────────────────────────────────────────────── */}
      <section className="border-b border-slate-100 bg-white py-10">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:divide-x lg:divide-slate-200 lg:px-8">
          {valueProps.map(({ icon: Icon, title, detail }, i) => (
            <FadeUp key={title} delay={i * 0.08} className="flex items-center gap-4 lg:px-6 lg:first:pl-0">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm leading-snug">
                <span className="font-semibold text-slate-900">{title}</span>
                <br />
                <span className="text-slate-500">{detail}</span>
              </p>
            </FadeUp>
          ))}
        </div>
      </section>

      {/* ── Three ways to create ──────────────────────────────────────────── */}
      <section id="how-it-works" className="bg-slate-50 py-24 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <FadeUp className="mx-auto max-w-2xl text-center">
            <Badge className="mb-4 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100">
              How It Works
            </Badge>
            <h2 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
              Three Ways to Create Programs
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              Choose the workflow that fits your style. Inmotus adapts to you.
            </p>
          </FadeUp>

          <div className="mt-16 grid gap-6 lg:grid-cols-3">
            {creationPaths.map((path, i) => {
              const Icon = path.icon;
              return (
                <FadeUp key={path.title} delay={i * 0.1}>
                  <Link
                    href="/sign-up"
                    className="group relative flex h-full items-start gap-5 overflow-hidden rounded-2xl border border-slate-200 bg-white p-8 transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-xl"
                  >
                    <div className={`inline-flex shrink-0 rounded-xl bg-linear-to-br ${path.gradient} p-3 text-white shadow-lg`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <h3 className="text-xl font-semibold text-slate-900">{path.title}</h3>
                        {path.badge && (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                            {path.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-sm leading-relaxed text-slate-600">{path.description}</p>
                    </div>
                    <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-slate-700" />
                  </Link>
                </FadeUp>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Platform features ─────────────────────────────────────────────── */}
      <section id="features" className="py-24 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <FadeUp className="mx-auto max-w-2xl text-center">
            <h2 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
              A complete platform for exercise professionals
            </h2>
            <p className="mt-4 text-lg text-slate-600">Program. Deliver. Monitor. All in one place.</p>
          </FadeUp>

          <div className="mt-16 grid grid-cols-2 gap-y-12 sm:grid-cols-3 lg:grid-cols-5 lg:divide-x lg:divide-slate-200">
            {platformFeatures.map(({ icon: Icon, title, description }, i) => (
              <FadeUp key={title} delay={i * 0.08} className="px-4 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-slate-900">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{description}</p>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ──────────────────────────────────────────────────── */}
      <section className="bg-slate-50 py-24 sm:py-28">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.6fr] lg:px-8">
          <FadeUp>
            <p className="mb-4 text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">
              Real professionals. Real impact.
            </p>
            <h2 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
              Trusted by exercise professionals.
            </h2>
          </FadeUp>
          <FadeUp delay={0.1}>
            <TestimonialCarousel />
          </FadeUp>
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
            className="absolute -bottom-20 right-1/3 h-64 w-64 rounded-full bg-emerald-500/15 blur-[80px]"
            animate={{ scale: [1.2, 1, 1.2] }}
            transition={{ duration: 8, repeat: Infinity }}
          />
        </div>
        <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <FadeUp>
            <h2 className="text-4xl font-extrabold text-white sm:text-5xl">
              Movement creates possibility.
            </h2>
            <p className="mt-4 text-lg text-slate-400">
              Start building better programs today.
            </p>
            <div className="mt-10 flex justify-center">
              <Button
                size="lg"
                className="h-13 gap-2 bg-linear-to-r from-blue-500 to-indigo-500 border-0 px-10 text-base font-semibold text-white shadow-xl shadow-blue-500/30 hover:from-blue-600 hover:to-indigo-600"
                asChild
              >
                <Link href="/sign-up">
                  Start Free
                  <ArrowRight className="h-4.5 w-4.5" />
                </Link>
              </Button>
            </div>
            <p className="mt-4 text-sm text-slate-500">No credit card required&nbsp;&nbsp;|&nbsp;&nbsp;Cancel anytime</p>
            <p className="mt-8 text-lg italic text-emerald-300/80">Better movement. Healthier lives.</p>
          </FadeUp>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
