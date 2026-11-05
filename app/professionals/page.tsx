import type { Metadata } from "next";
import { Apple, BarChart3, Dumbbell, MessageSquareText, TrendingUp, Users } from "lucide-react";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import {
  Container,
  CtaBand,
  DisplayHeading,
  Eyebrow,
  FeatureCard,
  HeroHighlight,
  PhotoBand,
  PillLink,
} from "@/components/marketing/primitives";
import { ChatSnippet, CreateProgramMenu, NutritionRing, ProgressChart } from "@/components/marketing/mini-ui";
import { GET_STARTED_HREF, pricingHref } from "@/lib/marketing-links";

export const metadata: Metadata = {
  title: "For Professionals",
  description:
    "The all-in-one platform to build programs, track progress, communicate with clients, and grow your business.",
};

const highlights = [
  { icon: BarChart3, label: "Save time with AI tools" },
  { icon: Users, label: "Keep clients more engaged" },
  { icon: TrendingUp, label: "Deliver better results" },
];

const features = [
  {
    icon: Dumbbell,
    title: "Build programs faster",
    description: "Use AI or create manually with our exercise library.",
    widget: <CreateProgramMenu />,
  },
  {
    icon: BarChart3,
    title: "Track progress",
    description: "Monitor workouts, performance metrics, and client adherence.",
    widget: <ProgressChart />,
  },
  {
    icon: MessageSquareText,
    title: "Stay connected",
    description: "Message clients, share feedback, and keep them engaged.",
    widget: (
      <ChatSnippet
        sender="Client"
        message="Great session today! Feeling stronger already."
        reply="That's awesome! Keep it up 💪"
      />
    ),
  },
  {
    icon: Apple,
    title: "Support nutrition",
    description: "Provide personalized guidance to fuel performance and recovery.",
    widget: <NutritionRing />,
  },
];

export default function ProfessionalsPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-cream text-ink">
      <MarketingNav />

      <PhotoBand
        src="/landing/pros-hero.jpg"
        alt="A coach reviewing client programs in MIA Performance on a laptop"
        priority
      >
        <div>
          <Eyebrow>For professionals</Eyebrow>
          <DisplayHeading as="h1" className="mt-4">
            Your expertise.
            <br />
            Greater impact.
          </DisplayHeading>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-ink-soft">
            The all-in-one platform to build programs, track progress, communicate with clients, and grow your
            business.
          </p>
          <div className="mt-8 grid gap-5 sm:grid-cols-3">
            {highlights.map((h) => (
              <HeroHighlight key={h.label} icon={h.icon}>
                {h.label}
              </HeroHighlight>
            ))}
          </div>
          <div className="mt-9 flex flex-wrap gap-3">
            <PillLink href={GET_STARTED_HREF}>Start your free trial</PillLink>
            <PillLink href={pricingHref("trainers")} variant="light" arrow={false}>
              See pricing
            </PillLink>
          </div>
        </div>
      </PhotoBand>

      <section className="py-14 sm:py-20">
        <Container>
          <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
            <div>
              <Eyebrow>Tools to support every part of your practice</Eyebrow>
              <DisplayHeading className="mt-3">
                Everything you need
                <br />
                to move your clients forward.
              </DisplayHeading>
            </div>
            <p className="max-w-md text-base leading-relaxed text-ink-soft lg:justify-self-end">
              MIA Performance combines intelligent programming, real-time insights, and seamless communication to help
              you deliver exceptional care and grow your business.
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

      {/* Pricing lives on /pricing; this is a short pointer, not a second table. */}
      <section id="pricing" className="scroll-mt-20 pb-14 sm:pb-20">
        <Container>
          <div className="flex flex-col gap-6 rounded-3xl border border-sand-line bg-white/60 p-6 sm:p-8 md:flex-row md:items-center md:justify-between">
            <div>
              <Eyebrow>Simple, flexible pricing</Eyebrow>
              <h2 className="mt-2 text-2xl font-normal tracking-[-0.02em] text-ink sm:text-3xl">
                Plans from $39.99/month, priced by active clients.
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft sm:text-base">
                Starter, Growth, and Pro — every plan starts with a 7-day free trial.
              </p>
            </div>
            <PillLink href={pricingHref("trainers")} className="shrink-0">
              Compare plans
            </PillLink>
          </div>
        </Container>
      </section>

      <CtaBand
        eyebrow="Help more people move better"
        title="Start your free trial."
        body="Join movement professionals using MIA Performance to deliver better results and grow their practice."
        src="/landing/pros-cta.jpg"
        alt="A coach using MIA Performance on a tablet in the gym"
        actions={
          <>
            <PillLink href={GET_STARTED_HREF}>Start your free trial</PillLink>
            <PillLink href={pricingHref("trainers")} variant="light" arrow={false}>
              See pricing
            </PillLink>
          </>
        }
      />

      <MarketingFooter />
    </div>
  );
}
