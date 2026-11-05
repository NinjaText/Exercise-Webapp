import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { Container, DisplayHeading, Eyebrow } from "@/components/marketing/primitives";
import { CALENDLY_URL, isExternalHref, pricingHref } from "@/lib/marketing-links";

export const metadata: Metadata = {
  title: "Get started",
  description: "Tell us who MIA Performance is for — clubs, trainers and professionals, or individuals.",
};

const OPTIONS = [
  {
    title: "Clubs",
    description: "Bring personalized exercise, programs, and expert guidance to your members.",
    image: "/landing/aud-clubs.jpg",
    href: CALENDLY_URL,
    cta: "Schedule a consultation",
    note: "Partnerships start with a short call.",
  },
  {
    title: "Trainers & Professionals",
    description: "Build programs faster, track progress, and keep every client engaged.",
    image: "/landing/aud-pros.jpg",
    href: pricingHref("trainers"),
    cta: "See plans & start a free trial",
    note: "7-day free trial on every plan.",
  },
  {
    title: "Individuals",
    description: "Train with programming designed by a Doctor of Physical Therapy.",
    image: "/landing/aud-indiv.jpg",
    href: pricingHref("individuals"),
    cta: "See plans & start a free trial",
    note: "7-day free trial on Starter.",
  },
];

export default function GetStartedPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-cream text-ink">
      <MarketingNav />

      <section className="pt-28 pb-16 sm:pt-32 sm:pb-20 lg:pt-36">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>Start your free trial</Eyebrow>
            <DisplayHeading as="h1" className="mt-4">
              Who is MIA Performance for?
            </DisplayHeading>
            <p className="mt-5 text-lg leading-relaxed text-ink-soft">
              Pick the option that fits you and we&apos;ll take you to the right place.
            </p>
          </div>

          <ul className="mt-12 grid gap-4 md:grid-cols-3">
            {OPTIONS.map((o) => {
              const external = isExternalHref(o.href);
              const newTab = o.href.startsWith("http");
              const body = (
                <>
                  <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-cream-deep">
                    <Image
                      src={o.image}
                      alt=""
                      fill
                      sizes="(min-width: 768px) 33vw, 100vw"
                      className="object-cover object-top transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                  <div className="flex flex-1 flex-col px-2 pt-5 pb-2">
                    <h2 className="text-2xl font-normal tracking-[-0.02em] text-ink">{o.title}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-ink-soft">{o.description}</p>
                    <span className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-ink">
                      {external && <CalendarDays className="h-4 w-4" aria-hidden />}
                      {o.cta}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                    <span className="mt-1.5 text-xs text-ink-soft">{o.note}</span>
                  </div>
                </>
              );
              const classes =
                "group flex h-full flex-col rounded-3xl border border-sand-line bg-white/60 p-3 transition-colors hover:border-clay hover:bg-white focus-visible:ring-2 focus-visible:ring-clay focus-visible:outline-none";
              return (
                <li key={o.title}>
                  {external ? (
                    <a
                      href={o.href}
                      className={classes}
                      {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    >
                      {body}
                    </a>
                  ) : (
                    <Link href={o.href} className={classes}>
                      {body}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>

          <p className="mt-10 text-center text-sm text-ink-soft">
            Already have an account?{" "}
            <Link href="/sign-in" className="font-medium text-ink underline underline-offset-4 hover:text-ink/70">
              Sign in
            </Link>
          </p>
        </Container>
      </section>

      <MarketingFooter />
    </div>
  );
}
