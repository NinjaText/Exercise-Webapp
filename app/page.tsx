import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BarChart3, Dumbbell, Heart, MessageSquareText, Apple, TrendingUp, Users } from "lucide-react";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import {
  Container,
  CtaBand,
  DEMO_HREF,
  DisplayHeading,
  Eyebrow,
  FeatureCard,
  PhotoBand,
  PillLink,
  SIGN_UP_HREF,
} from "@/components/marketing/primitives";
import {
  ChatSnippet,
  NutritionRing,
  OnTrackCard,
  ProgressChart,
  WeekPlanBars,
  WorkoutComplete,
} from "@/components/marketing/mini-ui";
import { PRODUCT_EXPANSION } from "@/lib/brand";

const heroChips = [
  { icon: BarChart3, label: "Adapts to your clients" },
  { icon: Users, label: "Built for clubs" },
  { icon: Heart, label: "Keeps people engaged" },
];

const audiences = [
  {
    title: "Clubs",
    href: "/clubs",
    image: "/landing/aud-clubs.jpg",
    description: "Drive engagement, improve retention, and deliver a modern member experience.",
  },
  {
    title: "Professionals",
    href: "/professionals",
    image: "/landing/aud-pros.jpg",
    description: "Deliver better results with smarter tools and deeper client insights.",
  },
  {
    title: "Individuals",
    href: "/individuals",
    image: "/landing/aud-indiv.jpg",
    description: "Get a personalized plan for a stronger, healthier, more balanced you.",
  },
];

const features = [
  {
    icon: Dumbbell,
    title: "Personalized programs",
    description: "Adaptive training plans that evolve with progress and feedback.",
    widget: <WeekPlanBars />,
  },
  {
    icon: BarChart3,
    title: "Exercise tracking",
    description: "Log workouts, track performance, and monitor key metrics.",
    widget: <WorkoutComplete />,
  },
  {
    icon: MessageSquareText,
    title: "Messaging",
    description: "Stay connected with your coach or clients in one place.",
    widget: <ChatSnippet />,
  },
  {
    icon: Apple,
    title: "Nutrition support",
    description: "Get personalized guidance to fuel performance and recovery.",
    widget: <NutritionRing />,
  },
  {
    icon: TrendingUp,
    title: "Progress insights",
    description: "See real progress with clear, actionable insights and trends.",
    widget: <ProgressChart />,
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-cream text-ink">
      <MarketingNav />

      {/* ── Hero ── */}
      <PhotoBand
        src="/landing/home-hero.jpg"
        alt="The MIA Performance app showing today's program next to a woman training"
        priority
      >
        <div>
          <Eyebrow>{PRODUCT_EXPANSION}</Eyebrow>
          <DisplayHeading as="h1" className="mt-4">
            Smarter movement.
            <br />
            Better outcomes.
          </DisplayHeading>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-ink-soft">
            Personalized exercise, recovery, and performance for clubs, professionals, and individuals.
          </p>
          <ul className="mt-7 flex flex-wrap gap-2.5">
            {heroChips.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex items-center gap-2.5 rounded-full border border-sand-line bg-white/60 px-4 py-2.5 text-sm text-ink backdrop-blur"
              >
                <Icon className="h-4 w-4" strokeWidth={1.6} aria-hidden />
                {label}
              </li>
            ))}
          </ul>
          <PillLink href={SIGN_UP_HREF} className="mt-8">
            Start your free trial
          </PillLink>
        </div>
      </PhotoBand>

      {/* ── Audiences ── */}
      <section className="bg-cream-deep/60 py-14 sm:py-20">
        <Container className="grid items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]">
          <div>
            <Eyebrow className="max-w-[16rem] leading-relaxed">Built for every part of the movement ecosystem</Eyebrow>
            <DisplayHeading className="mt-4">
              Three audiences.
              <br />
              One intelligent platform.
            </DisplayHeading>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {audiences.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="group relative flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-2xl p-4 text-white sm:aspect-[4/5] lg:aspect-[1/1]"
              >
                <Image
                  src={a.image}
                  alt=""
                  fill
                  sizes="(min-width: 640px) 33vw, 100vw"
                  className="object-cover object-top transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/40 to-transparent" />
                <div className="relative flex items-end gap-3">
                  <div className="flex-1">
                    <h3 className="text-xl font-normal tracking-[-0.02em]">{a.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-white/80">{a.description}</p>
                  </div>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-ink">
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      {/* ── Features ── */}
      <section className="py-14 sm:py-20">
        <Container>
          <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
            <div>
              <Eyebrow>A complete platform for lasting progress</Eyebrow>
              <DisplayHeading className="mt-3">
                Everything you need
                <br />
                to move forward.
              </DisplayHeading>
            </div>
            <p className="max-w-md text-base leading-relaxed text-ink-soft lg:justify-self-end">
              MIA Performance combines intelligent programming, real-time insights, and seamless communication to help
              people move better, feel better, and achieve more.
            </p>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {features.map((f) => (
              <FeatureCard key={f.title} icon={f.icon} title={f.title} description={f.description}>
                {f.widget}
              </FeatureCard>
            ))}
          </div>
        </Container>
      </section>

      {/* ── CTA ── */}
      <CtaBand
        eyebrow="A healthier, stronger future starts here"
        title="Start your free trial."
        body="Join clubs, professionals, and individuals who use MIA Performance to achieve smarter movement and better outcomes."
        src="/landing/home-cta.jpg"
        alt="A man resting after a workout"
        actions={
          <>
            <PillLink href={SIGN_UP_HREF}>Start your free trial</PillLink>
            <PillLink href={DEMO_HREF} variant="light" arrow={false}>
              Book a demo
            </PillLink>
          </>
        }
        aside={<OnTrackCard />}
      />

      <MarketingFooter />
    </div>
  );
}
