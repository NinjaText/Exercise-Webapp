import type { Metadata } from "next";
import { BarChart3, Gem, Heart, Layers, Shield, UserRound, Users } from "lucide-react";
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
} from "@/components/marketing/primitives";

export const metadata: Metadata = {
  title: "For Clubs",
  description:
    "Give your members an on-demand exercise library, personalized programs, and expert guidance at no cost to your club.",
};

const highlights = [
  { icon: Users, label: "Increase member engagement" },
  { icon: BarChart3, label: "Enhance wellness offerings" },
  { icon: Gem, label: "Position your club as a leader in innovation" },
];

const features = [
  {
    icon: Layers,
    title: "On-demand exercise library",
    description: "Access hundreds of expert-led workouts for golf, tennis, strength, mobility, recovery and more.",
  },
  {
    icon: UserRound,
    title: "Personalized programs",
    description: "Members can follow structured programs tailored to their goals, equipment, and ability level.",
  },
  {
    icon: BarChart3,
    title: "Track progress",
    description: "Keep members motivated with workout tracking, performance insights, and milestones.",
  },
  {
    icon: Heart,
    title: "Support overall wellness",
    description: "Help members move better, feel better, and stay engaged year-round.",
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

export default function ClubsPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-cream text-ink">
      <MarketingNav />

      <PhotoBand
        src="/landing/clubs-hero.jpg"
        alt="A tablet showing the MIA Performance exercise library in a club gym"
        priority
      >
        <div>
          <Eyebrow>For clubs</Eyebrow>
          <DisplayHeading as="h1" className="mt-4">
            Elevate your member experience.
          </DisplayHeading>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-ink-soft">
            Give your members access to an on-demand exercise library, personalized programs, and expert guidance at no
            cost to your club.
          </p>
          <div className="mt-8 grid gap-5 sm:grid-cols-3">
            {highlights.map((h) => (
              <HeroHighlight key={h.label} icon={h.icon}>
                {h.label}
              </HeroHighlight>
            ))}
          </div>
          <div className="mt-9 flex flex-wrap gap-3">
            <PillLink href={DEMO_HREF}>Bring MIA to your club</PillLink>
            <PillLink href={DEMO_HREF} variant="light" arrow={false}>
              Book a demo
            </PillLink>
          </div>
        </div>
      </PhotoBand>

      <section className="py-14 sm:py-20">
        <Container>
          <Eyebrow>A complete solution for your members</Eyebrow>
          <DisplayHeading className="mt-3 max-w-3xl">
            Everything your club needs to support healthier, more active members.
          </DisplayHeading>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <FeatureCard key={f.title} layout="inline" {...f} />
            ))}
          </div>
        </Container>
      </section>

      <CtaBand
        eyebrow="Let's build a stronger, healthier community"
        title="Bring MIA to your club."
        body="Schedule a demo to see how MIA Performance can enhance your member experience."
        src="/landing/clubs-cta.jpg"
        alt="A club terrace overlooking a golf course at sunset"
        actions={
          <>
            <PillLink href={DEMO_HREF}>Book a demo</PillLink>
            <PillLink href="/" variant="light" arrow={false}>
              Learn more
            </PillLink>
          </>
        }
      />

      <MarketingFooter />
    </div>
  );
}
