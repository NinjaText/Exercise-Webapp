import Link from "next/link";
import { Shield } from "lucide-react";
import { ProductLogo } from "@/components/branding/product-logo";
import { PRODUCT_EXPANSION, PRODUCT_NAME } from "@/lib/brand";

const FOOTER_COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "Pricing", href: "/#pricing" },
      { label: "How it Works", href: "/#how-it-works" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Blog", href: "#" },
      { label: "Careers", href: "#" },
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

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:gap-12 lg:grid-cols-5">
          {/* Brand */}
          <div className="col-span-2">
            <ProductLogo surface="light" className="h-5" />
            <p className="mt-3 text-[11px] font-medium tracking-[0.3em] text-muted-foreground uppercase">
              {PRODUCT_EXPANSION}
            </p>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              AI-powered home exercise programs for modern rehabilitation. Built for trainers, designed for clients.
            </p>
            <div className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Shield className="h-3.5 w-3.5 text-success" />
              HIPAA Compliant · SOC 2 Type II
            </div>
          </div>

          {/* Links */}
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold text-foreground">{col.title}</h3>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-8 text-center sm:mt-16 sm:flex-row sm:text-left">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} {PRODUCT_NAME}. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground">
            Made with ♥ for better rehabilitation outcomes
          </p>
        </div>
      </div>
    </footer>
  );
}
