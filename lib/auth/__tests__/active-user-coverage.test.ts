import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Server actions and API routes resolving the caller straight from Clerk must
 * refuse deactivated accounts (a removed club trainer keeps role TRAINER and
 * owns club programs until a replacement accepts). This scans the sources so a
 * new unguarded lookup fails here.
 */
const ROOT = process.cwd();

// Intentionally unguarded: onboarding/billing flows and org-gated routes.
const ALLOWED = new Set([
  "actions/onboarding-actions.ts",
  "actions/club-trainer-onboarding-actions.ts",
  "actions/compliance-actions.ts", // requires a non-null clerkOrgId
  "app/api/branding/assets/route.ts", // requires a non-null clerkOrgId
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (name === "__tests__" || name === "node_modules") continue;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}

// Webhooks/Stripe callbacks have no signed-in caller. Checkout is scanned:
// a deactivated account must not be able to start paying.
const SKIP_DIRS = ["app/api/webhooks/", "app/api/stripe/"];

describe("deactivated users are refused by direct-auth actions and routes", () => {
  const files = [...walk("actions"), ...walk("app/api")].filter(
    (f) => !ALLOWED.has(f) && !SKIP_DIRS.some((d) => f.startsWith(d))
  );

  it.each(files)("%s wraps its Clerk-id user lookups in activeUserOnly", (file) => {
    const src = readFileSync(join(ROOT, file), "utf8");
    const lookups = src.match(/prisma\.user\.find(?:Unique|First)\(\s*\{\s*where:\s*\{\s*clerkId(?::\s*\w+)?\s*\}/g) ?? [];
    const guarded = src.match(/activeUserOnly\(\s*(?:await\s+)?prisma\.user\.find(?:Unique|First)\(\s*\{\s*where:\s*\{\s*clerkId/g) ?? [];
    const guardedSelect = src.match(/activeUserOnly\(\s*await prisma\.user\.findUnique\(\{\s*where: \{ clerkId/g) ?? [];
    expect(lookups.length).toBeLessThanOrEqual(Math.max(guarded.length, guardedSelect.length));
  });

  it.each(files)("%s never double-wraps activeUserOnly", (file) => {
    const src = readFileSync(join(ROOT, file), "utf8");
    expect(src).not.toMatch(/activeUserOnly\(\s*activeUserOnly\(/);
  });
});
