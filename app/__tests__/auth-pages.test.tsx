import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const clerkProps = vi.hoisted(() => ({
  signIn: undefined as Record<string, unknown> | undefined,
  signUp: undefined as Record<string, unknown> | undefined,
}));

vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));
const cookieJar = vi.hoisted(() => ({ ref: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => (cookieJar.ref ? { value: cookieJar.ref } : undefined) })),
}));
vi.mock("@/actions/referral-code-actions", () => ({ checkReferralCode: vi.fn() }));
// The agreement + referral UI is placed inside Clerk's form in the browser
// only; here we check what the page hands the sign-up wrapper.
const consentedProps = vi.hoisted(() => ({ value: undefined as Record<string, unknown> | undefined }));
vi.mock("@/components/auth/consented-sign-up", async () => {
  const { SignUp } = await import("@clerk/nextjs");
  return {
    ConsentedSignUp: ({ referral, ...props }: Record<string, unknown>) => {
      consentedProps.value = { referral, ...props };
      return <SignUp {...props} />;
    },
  };
});

vi.mock("@clerk/nextjs", () => ({
  SignIn: (props: Record<string, unknown>) => {
    clerkProps.signIn = props;
    return <div data-testid="clerk-sign-in" />;
  },
  SignUp: (props: Record<string, unknown>) => {
    clerkProps.signUp = props;
    return <div data-testid="clerk-sign-up" />;
  },
  SignOutButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const resolved = {
  enabled: false,
  displayName: "MIA Performance",
  logoOnLightUrl: null,
  logoOnDarkUrl: null,
  markUrl: null,
};
vi.mock("@/lib/services/branding.service", () => ({
  getOrgBranding: vi.fn(async () => resolved),
  getCurrentBranding: vi.fn(async () => resolved),
}));

import SignInPage from "../sign-in/[[...sign-in]]/page";
import SignUpPage from "../sign-up/[[...sign-up]]/page";
import AccountDeactivatedPage from "../account-deactivated/page";
import AccountDeletedPage from "../account-deleted/page";

async function html(page: () => Promise<React.ReactElement>) {
  return renderToStaticMarkup(await page());
}

describe("auth pages use AuthShell", () => {
  it("sign-in", async () => {
    const out = await html(SignInPage);
    expect(out).toContain('data-slot="auth-shell"');
    expect(out).toContain("Welcome back");
    expect(out).toContain("Sign in to manage your clients and programs.");
    expect(out).toContain("clerk-sign-in");
    expect(clerkProps.signIn?.forceRedirectUrl).toBe("/onboarding");
    expect(out).not.toMatch(/<h1/);
  });

  const signUp = (params: Record<string, string> = {}) => () => SignUpPage({ searchParams: Promise.resolve(params) });

  it("sign-up", async () => {
    const out = await html(signUp());
    expect(out).toContain('data-slot="auth-shell"');
    expect(out).toContain("Create your account");
    expect(out).toContain("Track client progress");
    expect(out).toContain("clerk-sign-up");
    expect(clerkProps.signUp?.forceRedirectUrl).toBe("/onboarding");
    expect(out).not.toMatch(/<h1/);
    expect(consentedProps.value?.referral).toEqual({ initialCode: null });
  });

  it("sign-up pre-fills the referral code from the link cookie", async () => {
    cookieJar.ref = "jordan-7k3q";
    await html(signUp());
    cookieJar.ref = undefined;
    expect(consentedProps.value?.referral).toEqual({ initialCode: "JORDAN-7K3Q" });
  });

  it("invitation sign-ups have no referral field", async () => {
    await html(signUp({ __clerk_ticket: "tkt" }));
    expect(consentedProps.value?.referral).toBeUndefined();
  });

  it("account-deactivated", async () => {
    const out = await html(AccountDeactivatedPage);
    expect(out).toContain('data-slot="auth-shell"');
    expect(out).toContain("Account deactivated");
    expect(out).toContain("Sign out");
    expect(out).toContain("for help.");
  });

  it("account-deleted", async () => {
    const out = await html(AccountDeletedPage);
    expect(out).toContain('data-slot="auth-shell"');
    expect(out).toContain("Your account has been deleted");
    expect(out).toContain('href="/"');
  });
});
