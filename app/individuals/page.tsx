import type { Metadata } from "next";
import Image from "next/image";
import { Apple, BarChart3, Dumbbell, FileText, MessagesSquare, PersonStanding, StretchHorizontal, Zap } from "lucide-react";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import {
  Container,
  DisplayHeading,
  Eyebrow,
  FeatureCard,
  HeroHighlight,
  IconTile,
  PhotoBand,
  PillLink,
  SIGN_UP_HREF,
} from "@/components/marketing/primitives";
import { ChatSnippet, FollowAlongCard, NutritionRing, ProgressChart } from "@/components/marketing/mini-ui";

export const metadata: Metadata = {
  title: "For Individuals",
  description:
    "Personalized exercise, mobility, and recovery programs designed by a Doctor of Physical Therapy.",
};

const highlights = [
  { icon: PersonStanding, label: "Get out of pain" },
  { icon: StretchHorizontal, label: "Improve flexibility" },
  { icon: Zap, label: "Build agility" },
  { icon: Dumbbell, label: "Increase strength" },
];

const features = [
  {
    icon: FileText,
    title: "Personalized programs",
    description: "Get a training plan tailored to your goals, limitations, and equipment.",
    widget: <FollowAlongCard />,
  },
  {
    icon: BarChart3,
    title: "Track your progress",
    description: "Log workouts, see real results, and stay motivated over time.",
    widget: <ProgressChart second="Mobility" />,
  },
  {
    icon: MessagesSquare,
    title: "Expert guidance",
    description: "Get support, ask questions, and stay consistent with your goals.",
    widget: (
      <ChatSnippet
        message="Great workout today! Keep up the momentum."
        reply="Thank you! Feeling stronger already. 💪"
      />
    ),
  },
  {
    icon: Apple,
    title: "Nutrition support",
    description: "Get personalized guidance to fuel performance, recovery, and overall health.",
    widget: <NutritionRing />,
  },
];

const focuses = [
  {
    icon: PersonStanding,
    title: "Get out of pain",
    description: "Reduce pain and build a more resilient body.",
    image: "/landing/focus-pain.jpg",
  },
  {
    icon: StretchHorizontal,
    title: "Improve flexibility",
    description: "Move with greater ease and mobility.",
    image: "/landing/focus-flex.jpg",
  },
  {
    icon: Zap,
    title: "Boost agility",
    description: "Move better, react faster, and perform at a higher level.",
    image: "/landing/focus-agility.jpg",
  },
  {
    icon: Dumbbell,
    title: "Build strength",
    description: "Feel stronger, more capable, and more confident.",
    image: "/landing/focus-strength.jpg",
  },
];

export default function IndividualsPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-cream text-ink">
      <MarketingNav />

      <PhotoBand
        src="/landing/indiv-hero.jpg"
        alt="The MIA Performance app showing today's program next to a man training"
        priority
      >
        <div>
          <Eyebrow>Built by a Doctor of Physical Therapy</Eyebrow>
          <DisplayHeading as="h1" className="mt-4">
            Move better.
            <br />
            Feel stronger.
            <br />
            Live without limits.
          </DisplayHeading>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-ink-soft">
            Personalized exercise, mobility, and recovery programs designed by a Doctor of Physical Therapy to help you
            get out of pain, move better, and reach your goals.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-4">
            {highlights.map((h) => (
              <HeroHighlight key={h.label} icon={h.icon}>
                {h.label}
              </HeroHighlight>
            ))}
          </div>
          <PillLink href={SIGN_UP_HREF} className="mt-9">
            Start your free trial
          </PillLink>
        </div>
      </PhotoBand>

      <section className="py-14 sm:py-20">
        <Container>
          <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
            <div>
              <Eyebrow>A complete solution for your goals</Eyebrow>
              <DisplayHeading className="mt-3">Personalized support for every stage of your journey.</DisplayHeading>
            </div>
            <p className="max-w-md text-base leading-relaxed text-ink-soft lg:justify-self-end">
              MIA Performance combines expert-designed programs, progress tracking, and ongoing support to help you move
              better, feel better, and achieve more.
            </p>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {features.map((f) => (
              <FeatureCard key={f.title} icon={f.icon} title={f.title} description={f.description}>
                {f.widget}
              </FeatureCard>
            ))}
          </div>
        </Container>
      </section>

      <section className="pb-14 sm:pb-20">
        <Container>
          <Eyebrow>Programs to help you move and feel your best</Eyebrow>
          <DisplayHeading className="mt-3">Choose your focus.</DisplayHeading>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {focuses.map((f) => (
              <div key={f.title} className="overflow-hidden rounded-2xl border border-sand-line bg-white/60">
                <div className="relative aspect-[2/1]">
                  <Image src={f.image} alt="" fill sizes="(min-width: 1280px) 25vw, 50vw" className="object-cover" />
                  {/* Covers the icon baked into the placeholder photo crop. */}
                  <IconTile icon={f.icon} className="absolute bottom-2 left-2 bg-white shadow-sm" />
                </div>
                <div className="p-5">
                  <h3 className="text-lg font-normal tracking-[-0.01em]">{f.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">{f.description}</p>
                </div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="bg-cream-deep py-10 sm:py-12">
        <Container className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          <Image
            src="/landing/dpt.jpg"
            alt="Doctor of Physical Therapy who designs MIA programs"
            width={112}
            height={112}
            className="h-24 w-24 rounded-full object-cover sm:h-28 sm:w-28"
          />
          <div className="flex-1">
            <Eyebrow>Expert care you can trust</Eyebrow>
            <h2 className="mt-2 text-2xl font-normal tracking-[-0.02em] sm:text-3xl">
              Built by a Doctor of Physical Therapy
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-soft sm:text-base">
              Programs designed by a DPT with over 10 years of experience helping people move better, overcome pain, and
              perform at their best.
            </p>
          </div>
          <PillLink href={SIGN_UP_HREF}>Start your free trial</PillLink>
        </Container>
      </section>

      <MarketingFooter />
    </div>
  );
}
