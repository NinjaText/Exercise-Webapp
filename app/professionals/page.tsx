import type { Metadata } from "next";
import { Apple, BarChart3, Dumbbell, MessageSquareText, TrendingUp, Users } from "lucide-react";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import {
  Container,
  CtaBand,
  DEMO_HREF,
  DisplayHeading,
  Eyebrow,
  FeatureCard,
  HeroHighlight,
  PhotoBand,
  PillLink,
  SIGN_UP_HREF,
} from "@/components/marketing/primitives";
import { ChatSnippet, CreateProgramMenu, NutritionRing, ProgressChart } from "@/components/marketing/mini-ui";
import { PricingPlans } from "@/components/marketing/pricing-plans";

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
            <PillLink href={SIGN_UP_HREF}>Start your free trial</PillLink>
            <PillLink href={DEMO_HREF} variant="light" arrow={false}>
              Book a demo
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

      <section id="pricing" className="scroll-mt-20 pb-14 sm:pb-20">
        <Container>
          <PricingPlans />
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
            <PillLink href={SIGN_UP_HREF}>Start your free trial</PillLink>
            <PillLink href={DEMO_HREF} variant="light" arrow={false}>
              Book a demo
            </PillLink>
          </>
        }
      />

      <MarketingFooter />
    </div>
  );
}
