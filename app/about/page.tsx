import type { Metadata } from "next";
import Image from "next/image";
import { Check, Dna, GraduationCap, Layers, Stethoscope, Target, Users, X, Zap, BookOpen } from "lucide-react";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { Container, DisplayHeading, Eyebrow, PillLink } from "@/components/marketing/primitives";
import { ProductLogo } from "@/components/branding/product-logo";
import { GET_STARTED_HREF } from "@/lib/marketing-links";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "About",
  description:
    "MIA Performance was designed by Dr. Sharon Ackerman, PT, DPT — a smarter, more personal approach to performance, rehab, and lifelong movement.",
};

/**
 * Warm accent for display text: ember pulled toward ink so it clears 3:1
 * contrast on cream at heading sizes (plain ember/clay don't).
 */
const ACCENT_TEXT = "text-[color-mix(in_oklab,var(--color-ember)_70%,var(--color-ink))]";

const CREDENTIALS = [
  { icon: GraduationCap, label: "Doctor of Physical Therapy (DPT)" },
  { icon: BookOpen, label: "Master's in Psychology (MS)" },
  { icon: Dna, label: "Bachelor's in Micro/Molecular Biology (BS)" },
];

const COMPARISON_ROWS = [
  { theirs: "Workout builder", ours: "PT-designed programming assistant" },
  { theirs: "Generic technology", ours: "PT-informed intelligent technology" },
  { theirs: "Exercise list", ours: "Intelligent exercise recommendations" },
  { theirs: "Manual progressions", ours: "Automatic progressions & regressions" },
  { theirs: "Basic client tracking", ours: "Coaching insights & adherence tracking" },
];

const DIFFERENTIATORS = [
  {
    icon: Target,
    title: "Personalized",
    description: "Programs built around your goals, needs, and movement profile.",
  },
  {
    icon: Layers,
    title: "Comprehensive",
    description: "A complete platform for rehab, performance, strength, mobility, and recovery.",
  },
  {
    icon: Zap,
    title: "Evidence-Based",
    description: "Clinically informed programming you can trust.",
  },
  {
    icon: Users,
    title: "Built for Your World",
    description: "Designed for individuals, trainers, and country clubs from rehab to high performance and healthy aging.",
  },
];

/** Eyebrow with the short warm rule from the mockup. */
function RuledEyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-4", className)}>
      <Eyebrow className="font-semibold text-ink">{children}</Eyebrow>
      <span className="h-0.5 w-10 rounded-full bg-gradient-to-r from-clay to-ember" aria-hidden />
    </div>
  );
}

export default function AboutPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-cream text-ink">
      <MarketingNav />

      {/* ── Hero ── */}
      <section className="pt-24 sm:pt-28 lg:pt-32">
        <Container className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-12">
          <div className="max-w-2xl lg:pb-16">
            <RuledEyebrow>About MIA Performance</RuledEyebrow>
            <DisplayHeading as="h1" className="mt-5">
              A smarter, more personal approach to performance, rehab, and{" "}
              <span className={ACCENT_TEXT}>lifelong movement.</span>
            </DisplayHeading>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">
              MIA Performance is an all-in-one platform that bridges rehabilitation, performance, and everyday
              fitness—built to keep you moving at your best, on and off the course.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
              <PillLink href={GET_STARTED_HREF}>Start your free trial</PillLink>
            </div>
            {/* Quiet credential note (matches the credential chips below), not a dark block that reads as a second button. */}
            <div className="mt-10 flex items-center gap-3.5">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sand/70">
                <Stethoscope className={cn("h-5 w-5", ACCENT_TEXT)} strokeWidth={1.6} aria-hidden />
              </span>
              <p className="text-sm leading-snug text-ink-soft sm:text-base">
                Designed by a <span className="font-medium text-ink">Doctor of Physical Therapy</span>
              </p>
            </div>
          </div>

          {/* Founder cutout: no frame — sits on a soft warm glow and fades out at the shoulders. */}
          <div className="relative mx-auto w-full max-w-[26rem] lg:mx-0 lg:justify-self-end">
            <div
              className="absolute inset-x-[-10%] top-[6%] bottom-0 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--color-ember)_28%,transparent),color-mix(in_oklab,var(--color-sand)_60%,transparent)_55%,transparent)] blur-2xl"
              aria-hidden
            />
            <Image
              src="/landing/sharon.png"
              alt="Dr. Sharon Ackerman, PT, DPT, founder of MIA Performance"
              width={389}
              height={389}
              priority
              sizes="(min-width: 1024px) 26rem, 90vw"
              className="relative h-auto w-full [mask-image:linear-gradient(to_bottom,black_72%,transparent)]"
            />
            <div className="absolute right-0 bottom-4 left-6 rounded-2xl border border-sand-line bg-cream/85 px-5 py-4 shadow-[0_18px_40px_-26px_rgba(60,40,20,0.45)] backdrop-blur sm:left-auto sm:min-w-[19rem]">
              <p className="text-lg font-medium tracking-[-0.01em] text-ink">Dr. Sharon Ackerman, PT, DPT</p>
              <p className="mt-1 flex items-center gap-2.5 text-[11px] font-semibold tracking-[0.24em] text-ink-soft uppercase">
                <span className="h-3.5 w-0.5 rounded-full bg-ember" aria-hidden />
                Founder
              </p>
            </div>
          </div>
        </Container>
      </section>

      {/* ── About me ── */}
      <section className="pt-10 pb-14 sm:pt-12 sm:pb-20">
        <Container>
          <div className="grid gap-8 rounded-3xl border border-sand-line bg-white/60 p-6 shadow-[0_1px_2px_rgba(60,40,20,0.04)] sm:p-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-0 lg:p-10">
            <div className="lg:pr-10">
              <RuledEyebrow>About me</RuledEyebrow>
              <p className="mt-5 text-base leading-relaxed text-ink-soft sm:text-[17px]">
                I&apos;m Dr. Sharon Ackerman, PT, DPT, Founder of MIA Performance. As a Doctor of Physical Therapy,
                I&apos;ve spent my career helping people recover from injury, move better, and perform at a higher
                level. I created MIA Performance to bring the thought process of a movement expert into an intelligent
                platform—giving individuals, trainers, and country clubs the tools to build smarter, personalized
                programs, and achieve lasting results.
              </p>
            </div>
            <div className="border-t border-sand-line pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
              <h2 className="sr-only">Credentials</h2>
              <ul className="space-y-5">
                {CREDENTIALS.map(({ icon: Icon, label }) => (
                  <li key={label} className="flex items-center gap-4">
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sand/70">
                      <Icon className={cn("h-5 w-5", ACCENT_TEXT)} strokeWidth={1.6} aria-hidden />
                    </span>
                    <span className="text-sm text-ink sm:text-base">{label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Container>
      </section>

      {/* ── See the difference ── */}
      <section className="pb-14 sm:pb-20">
        <Container className="max-w-5xl">
          <div className="flex items-center gap-4 sm:gap-6">
            <span className="h-0.5 flex-1 rounded-full bg-gradient-to-r from-transparent to-clay" aria-hidden />
            <DisplayHeading className="shrink-0 text-center">See the difference</DisplayHeading>
            <span className="h-0.5 flex-1 rounded-full bg-gradient-to-l from-transparent to-clay" aria-hidden />
          </div>

          <div className="mt-8 grid grid-cols-2 gap-2 sm:mt-10 sm:gap-3">
            <div className="overflow-hidden rounded-2xl border border-sand-line bg-white/50">
              <h3 className="flex h-14 items-center justify-center border-b border-sand-line bg-cream-deep/70 px-3 text-center text-sm text-ink-soft sm:h-16 sm:text-base">
                Other Training Apps
              </h3>
              <ul>
                {COMPARISON_ROWS.map((row) => (
                  <li
                    key={row.theirs}
                    className="flex min-h-14 items-center gap-2 border-b border-sand-line/70 px-3 py-3 text-xs text-ink-soft last:border-b-0 sm:gap-3 sm:px-6 sm:text-sm"
                  >
                    <X className="h-4 w-4 shrink-0 text-clay" aria-hidden />
                    <span className="sr-only">Other apps:</span>
                    {row.theirs}
                  </li>
                ))}
              </ul>
            </div>
            <div className="overflow-hidden rounded-2xl bg-ink shadow-[0_24px_50px_-30px_rgba(45,38,34,0.7)]">
              <h3 className="flex h-14 items-center justify-center px-3 sm:h-16">
                <ProductLogo surface="dark" className="h-3.5 sm:h-5" />
              </h3>
              <ul className="bg-cream-deep">
                {COMPARISON_ROWS.map((row) => (
                  <li
                    key={row.ours}
                    className="flex min-h-14 items-center gap-2 border-b border-sand-line px-3 py-3 text-xs font-medium text-ink last:border-b-0 sm:gap-3 sm:px-6 sm:text-sm"
                  >
                    <Check className={cn("h-4 w-4 shrink-0", ACCENT_TEXT)} strokeWidth={2.4} aria-hidden />
                    <span className="sr-only">MIA Performance:</span>
                    {row.ours}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Container>
      </section>

      {/* ── Why MIA is different ── */}
      <section className="pb-14 sm:pb-20">
        <Container>
          <h2 className="text-sm font-semibold tracking-[0.22em] text-ink uppercase sm:text-base">
            Why MIA Performance is different
          </h2>
          <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0">
            {DIFFERENTIATORS.map(({ icon: Icon, title, description }, i) => (
              <div key={title} className={cn("lg:px-8", i === 0 && "lg:pl-0", i > 0 && "lg:border-l lg:border-sand-line")}>
                <Icon className={cn("h-9 w-9", ACCENT_TEXT)} strokeWidth={1.4} aria-hidden />
                <h3 className="mt-4 text-xl font-medium tracking-[-0.02em] text-ink">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft sm:text-base">{description}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ── Mission + closing CTA ── */}
      <section className="pb-16 sm:pb-24">
        <Container>
          <div className="relative overflow-hidden rounded-3xl border border-sand-line bg-gradient-to-br from-cream-deep via-sand/80 to-[color-mix(in_oklab,var(--color-ember)_35%,var(--color-sand))] px-6 py-10 sm:px-10 sm:py-14 lg:px-14">
            {/* Low "sun" glow — evokes the mockup's sunset without a stock skyline. */}
            <div
              className="absolute -right-24 -bottom-40 h-96 w-96 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--color-ember)_45%,transparent),transparent)]"
              aria-hidden
            />
            <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
              <div className="max-w-2xl">
                <RuledEyebrow>Our mission</RuledEyebrow>
                <p className="mt-5 text-2xl leading-snug font-normal tracking-[-0.02em] text-ink sm:text-3xl lg:text-[2.1rem]">
                  To help people move better, feel stronger, and live an active, pain-free life—at every stage of their
                  journey.
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-start gap-3 lg:items-end">
                <PillLink href={GET_STARTED_HREF}>Start your free trial</PillLink>
                <p className="text-sm text-ink-soft">7-day free trial</p>
              </div>
            </div>
          </div>
        </Container>
      </section>

      <MarketingFooter />
    </div>
  );
}
