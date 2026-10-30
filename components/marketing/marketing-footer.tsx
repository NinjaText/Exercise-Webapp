import Link from "next/link";
import { ProductLogo } from "@/components/branding/product-logo";
import { PRODUCT_EXPANSION, PRODUCT_NAME } from "@/lib/brand";

const COLUMNS = [
  {
    title: "Solutions",
    links: [
      { label: "Clubs", href: "/clubs" },
      { label: "Professionals", href: "/professionals" },
      { label: "Individuals", href: "/individuals" },
      { label: "Pricing", href: "/professionals#pricing" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Sign in", href: "/sign-in" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-sand-line bg-cream py-12 sm:py-14">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-10 px-4 sm:px-6 lg:grid-cols-5 lg:px-10">
        <div className="col-span-2">
          <ProductLogo surface="light" className="h-5" />
          <p className="mt-3 text-[11px] tracking-[0.22em] text-ink-soft uppercase">{PRODUCT_EXPANSION}</p>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-soft">
            Personalized exercise, recovery, and performance for clubs, professionals, and individuals.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h3 className="text-sm font-medium text-ink">{col.title}</h3>
            <ul className="mt-4 space-y-3">
              {col.links.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-sm text-ink-soft transition-colors hover:text-ink">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mx-auto mt-12 max-w-7xl px-4 text-xs text-ink-soft sm:px-6 lg:px-10">
        &copy; {new Date().getFullYear()} {PRODUCT_NAME}. All rights reserved.
      </p>
    </footer>
  );
}
