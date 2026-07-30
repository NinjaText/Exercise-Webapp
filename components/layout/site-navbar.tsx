"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Activity, Menu, X } from "lucide-react";

const NAV_LINKS = [
  { label: "Features", href: "/#features" },
  { label: "How it Works", href: "/#how-it-works" },
  { label: "Pricing", href: "/#pricing" },
  { label: "About", href: "/about" },
];

export function SiteNavbar({ alwaysSolid = false }: { alwaysSolid?: boolean } = {}) {
  const { scrollY } = useScroll();
  const navOpacity = useTransform(scrollY, [0, 80], [0, 1]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 z-50 w-full">
      <motion.div
        className="absolute inset-0 border-b border-white/10 bg-[#0a0f1e]/90 backdrop-blur-xl"
        style={alwaysSolid ? undefined : { opacity: navOpacity }}
      />
      <div className="relative mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <motion.div
          className="flex items-center gap-2.5"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
        >
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-blue-400 to-indigo-500 shadow-lg shadow-blue-500/30">
              <Activity className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight text-white">INMOTUS RX</span>
          </Link>
        </motion.div>

        {/* Desktop links */}
        <motion.div
          className="hidden items-center gap-8 md:flex"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          {NAV_LINKS.map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              className="text-sm text-slate-300 transition-colors hover:text-white"
            >
              {label}
            </Link>
          ))}
        </motion.div>

        {/* CTA buttons */}
        <motion.div
          className="hidden items-center gap-3 md:flex"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
        >
          <Button variant="ghost" size="sm" className="text-slate-300 hover:bg-white/10 hover:text-white" asChild>
            <Link href="/sign-in">Sign In</Link>
          </Button>
          <Button size="sm" className="bg-linear-to-r from-blue-500 to-indigo-500 border-0 text-white shadow-lg shadow-blue-500/30 hover:from-blue-600 hover:to-indigo-600" asChild>
            <Link href="/sign-up">Get Started</Link>
          </Button>
        </motion.div>

        {/* Mobile menu toggle */}
        <button
          className="inline-flex items-center justify-center rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white md:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="relative border-t border-white/10 bg-[#0a0f1e]/95 backdrop-blur-xl md:hidden"
          >
            <div className="space-y-1 px-4 py-4">
              {NAV_LINKS.map(({ label, href }) => (
                <Link
                  key={label}
                  href={href}
                  className="block rounded-lg px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {label}
                </Link>
              ))}
              <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4">
                <Button variant="ghost" className="w-full border border-white/20 text-white hover:bg-white/10 hover:text-white" asChild>
                  <Link href="/sign-in">Sign In</Link>
                </Button>
                <Button className="w-full bg-linear-to-r from-blue-500 to-indigo-500 border-0 text-white" asChild>
                  <Link href="/sign-up">Get Started Free</Link>
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
