import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const clerkProps = vi.hoisted(() => ({ signIn: [] as unknown[], signUp: [] as unknown[] }));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: () => ({ value: "tok" }) })) }));
vi.mock("@clerk/nextjs", () => ({
  SignIn: (props: unknown) => {
    clerkProps.signIn.push(props);
    return null;
  },
  SignUp: (props: unknown) => {
    clerkProps.signUp.push(props);
    return null;
  },
}));
vi.mock("@/lib/services/club.service", () => ({ getClubBySlug: vi.fn() }));
vi.mock("@/lib/services/branding.service", () => ({
  getOrgBranding: vi.fn(async () => ({ displayName: "Pine Valley" })),
}));
vi.mock("@/lib/ui/clerk-appearance", () => ({ clerkAuthAppearance: () => ({}) }));
vi.mock("@/lib/branding/types", () => ({ toViewModel: (b: unknown) => b }));
vi.mock("@/components/branding/brand-style", () => ({ BrandStyle: () => null }));
vi.mock("@/components/auth/auth-shell", () => ({
  AuthShell: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/lib/clubs/join-token", () => ({ JOIN_COOKIE: "club_join", verifyJoinToken: vi.fn(() => true) }));
vi.mock("../join-code-form", () => ({ JoinCodeForm: () => "JOIN_FORM" }));

import { getClubBySlug } from "@/lib/services/club.service";
import { verifyJoinToken } from "@/lib/clubs/join-token";
import JoinClubPage from "../page";
import JoinSignInPage from "../sign-in/page";

const params = { params: Promise.resolve({ slug: "pine" }) };

beforeEach(() => {
  vi.clearAllMocks();
  clerkProps.signIn.length = 0;
  clerkProps.signUp.length = 0;
  vi.mocked(getClubBySlug).mockResolvedValue({ clerkOrgId: "org_club" } as any);
  vi.mocked(verifyJoinToken).mockReturnValue(true);
});

describe("club join: existing-account sign in", () => {
  it("points the sign-up form's sign-in link at the club's own sign-in page", async () => {
    renderToStaticMarkup(await JoinClubPage(params));
    expect(clerkProps.signUp[0]).toMatchObject({ signInUrl: "/join/pine/sign-in" });
  });

  it("signs in on one page and returns to the club's complete step", async () => {
    renderToStaticMarkup(await JoinSignInPage(params));
    expect(clerkProps.signIn[0]).toMatchObject({
      routing: "hash",
      forceRedirectUrl: "/join/pine/complete",
      signUpUrl: "/join/pine",
    });
  });

  it("sends a visitor without a verified access code back to the code form", async () => {
    vi.mocked(verifyJoinToken).mockReturnValue(false);
    await expect(JoinSignInPage(params)).rejects.toThrow(/^REDIRECT:\/join\/pine$/);
  });

  it("404s an unknown club", async () => {
    vi.mocked(getClubBySlug).mockResolvedValue(null);
    await expect(JoinSignInPage(params)).rejects.toThrow("NOT_FOUND");
  });
});
