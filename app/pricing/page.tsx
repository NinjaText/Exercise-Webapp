import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { Container, DisplayHeading, Eyebrow } from "@/components/marketing/primitives";
import { PricingTabs } from "@/components/marketing/pricing-plans";
import { CALENDLY_URL, isExternalHref, parsePricingTab } from "@/lib/marketing-links";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "MIA Performance pricing for clubs, trainers, and individuals. Trainer and individual plans start with a 7-day free trial.",
};

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[]; unavailable?: string | string[] }> }) {
  const { tab, unavailable } = await searchParams;
  // /start/individual sends people here when the Individuals club isn't set up yet.
  const individualUnavailable = unavailable === "individual";
  const initialTab = parsePricingTab(Array.isArray(tab) ? tab[0] : tab);

  return (
    <div className="min-h-screen overflow-x-hidden bg-cream text-ink">
      <MarketingNav />

      <section className="pt-28 pb-16 sm:pt-32 sm:pb-20 lg:pt-36">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>Simple, flexible pricing</Eyebrow>
            <DisplayHeading as="h1" className="mt-4">
              Pricing built around how you move.
            </DisplayHeading>
            <p className="mt-5 text-lg leading-relaxed text-ink-soft">
              Choose who MIA Performance is for — your club, your training practice, or yourself.
            </p>
          </div>
          {individualUnavailable && (
            <div
              role="status"
              className="mx-auto mt-8 max-w-2xl rounded-2xl border border-sand-line bg-white/70 px-5 py-4 text-center text-sm leading-relaxed text-ink"
            >
              Online sign-up for individuals is opening soon. In the meantime,{" "}
              <a
                href={CALENDLY_URL}
                {...(isExternalHref(CALENDLY_URL) && CALENDLY_URL.startsWith("http")
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                className="font-medium underline underline-offset-2 hover:text-ink/70"
              >
                book a call with our team
              </a>{" "}
              and we&apos;ll get you started.
            </div>
          )}
          <div className="mt-10 sm:mt-12">
            <PricingTabs initialTab={initialTab} />
          </div>
        </Container>
      </section>

      <MarketingFooter />
    </div>
  );
}
