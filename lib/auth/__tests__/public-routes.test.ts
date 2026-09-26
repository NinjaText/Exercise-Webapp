import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { createRouteMatcher } from "@clerk/nextjs/server";
import { PUBLIC_ROUTES } from "../public-routes";

// proxy.ts builds `isPublicRoute` from exactly this list, so this matcher is
// the one that decides whether Clerk's `auth.protect()` runs for a path.
const isPublicRoute = createRouteMatcher([...PUBLIC_ROUTES]);

const req = (path: string, method = "GET") =>
  new NextRequest(new URL(path, "http://localhost:3000"), { method });

describe("PUBLIC_ROUTES", () => {
  it("keeps the brand asset upload route protected", () => {
    expect(isPublicRoute(req("/api/branding/assets", "POST"))).toBe(false);
    expect(isPublicRoute(req("/api/branding/assets/"))).toBe(false);
  });

  it("keeps settings pages protected", () => {
    expect(isPublicRoute(req("/settings/branding"))).toBe(false);
  });

  it.each([
    "/",
    "/sign-in",
    "/api/webhooks/clerk",
    "/api/stripe/webhook",
    "/api/cron/nutrition-nudges",
    "/api/reminders",
    "/api/notifications/unsubscribe",
  ])("treats %s as public", (path) => {
    expect(isPublicRoute(req(path, "POST"))).toBe(true);
  });
});
