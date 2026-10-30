"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, ChevronDown, Menu, X } from "lucide-react";
import { ProductLogo } from "@/components/branding/product-logo";
import { cn } from "@/lib/utils";

const SOLUTIONS = [
  { label: "Clubs", href: "/clubs", description: "Engage and retain members" },
  { label: "Professionals", href: "/professionals", description: "Programs, tracking and messaging" },
  { label: "Individuals", href: "/individuals", description: "A plan built around you" },
];

const LINKS = [...SOLUTIONS, { label: "Pricing", href: "/professionals#pricing" }];

export function MarketingNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-colors",
        scrolled || open ? "border-b border-sand-line bg-cream/90 backdrop-blur-xl" : "bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:h-[72px] sm:px-6 lg:px-10">
        <Link href="/" className="flex items-center" aria-label="MIA Performance home">
          <ProductLogo surface="light" className="h-[18px] sm:h-5" />
        </Link>

        <nav className="hidden items-center gap-8 lg:flex" aria-label="Main">
          <div className="group relative">
            <button
              type="button"
              className="flex items-center gap-1 py-2 text-sm text-ink transition-colors hover:text-ink/70"
              aria-haspopup="true"
            >
              Solutions <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            </button>
            <div className="invisible absolute top-full left-1/2 w-72 -translate-x-1/2 pt-2 opacity-0 transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
              <div className="rounded-2xl border border-sand-line bg-cream p-2 shadow-xl shadow-ink/5">
                {SOLUTIONS.map((s) => (
                  <Link key={s.href} href={s.href} className="block rounded-xl px-3 py-2.5 hover:bg-cream-deep">
                    <span className="block text-sm font-medium text-ink">{s.label}</span>
                    <span className="block text-xs text-ink-soft">{s.description}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
          {LINKS.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.label}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "border-b py-2 text-sm text-ink transition-colors hover:text-ink/70",
                  active ? "border-ink" : "border-transparent",
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-6 lg:flex">
          <Link href="/sign-in" className="text-sm text-ink-soft transition-colors hover:text-ink">
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-sm font-medium text-cream transition-colors hover:bg-ink/90"
          >
            Start your free trial <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="-mr-2 inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink lg:hidden"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-sand-line bg-cream px-4 pt-3 pb-6 lg:hidden">
          {LINKS.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              onClick={() => setOpen(false)}
              className={cn(
                "block rounded-lg px-3 py-3 text-base text-ink hover:bg-cream-deep",
                pathname === l.href && "bg-cream-deep",
              )}
            >
              {l.label}
            </Link>
          ))}
          <div className="mt-4 grid gap-2 border-t border-sand-line pt-4">
            <Link
              href="/sign-in"
              onClick={() => setOpen(false)}
              className="flex h-11 items-center justify-center rounded-full border border-sand-line bg-white/70 text-sm text-ink"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              onClick={() => setOpen(false)}
              className="flex h-11 items-center justify-center gap-2 rounded-full bg-ink text-sm font-medium text-cream"
            >
              Start your free trial <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
