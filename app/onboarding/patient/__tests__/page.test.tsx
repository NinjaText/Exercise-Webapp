import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@clerk/nextjs", () => ({
  SignUp: (p: { forceRedirectUrl: string; routing: string }) => `SIGNUP:${p.routing}:${p.forceRedirectUrl}`,
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock("@/components/onboarding/client-onboarding-form", () => ({ ClientOnboardingForm: () => "CLIENT_FORM" }));

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import Page from "../page";

beforeEach(() => vi.clearAllMocks());

describe("/onboarding/patient (legacy alias of /onboarding/client)", () => {
  it("signed out: SignUp inside AuthShell, continuing to /onboarding/client", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as any);
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("SIGNUP:hash:/onboarding/client");
    expect(html).toContain('data-slot="auth-shell"');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("redirects an onboarded user to /dashboard", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "u1" } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ onboarded: true } as any);
    await expect(Page()).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("renders the client step form in the wide column with product branding", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "u1" } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ onboarded: false } as any);
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("CLIENT_FORM");
    expect(html).toMatch(/data-slot="auth-form-column" data-size="wide"/);
    expect(html).toContain("INMOTUS RX");
  });
});
