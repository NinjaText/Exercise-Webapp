import { describe, expect, it } from "vitest";
import { legacyHostRedirect } from "@/lib/utils/legacy-host";

describe("legacyHostRedirect", () => {
  it("sends an old-domain page to the same path and query on the new domain", () => {
    expect(legacyHostRedirect(new URL("https://app.goinmotus.com/messages/abc?x=1"))).toBe(
      "https://www.miaperformance.com/messages/abc?x=1",
    );
  });

  it("covers the bare and www old domains", () => {
    expect(legacyHostRedirect(new URL("https://goinmotus.com/"))).toBe("https://www.miaperformance.com/");
    expect(legacyHostRedirect(new URL("https://www.goinmotus.com/sign-in"))).toBe(
      "https://www.miaperformance.com/sign-in",
    );
  });

  it("leaves API routes and .well-known on the old domain", () => {
    expect(legacyHostRedirect(new URL("https://app.goinmotus.com/api/webhooks/stripe"))).toBeNull();
    expect(
      legacyHostRedirect(new URL("https://app.goinmotus.com/api/notifications/unsubscribe?token=t")),
    ).toBeNull();
    expect(legacyHostRedirect(new URL("https://app.goinmotus.com/.well-known/assetlinks.json"))).toBeNull();
  });

  it("leaves other hosts alone", () => {
    expect(legacyHostRedirect(new URL("https://www.miaperformance.com/dashboard"))).toBeNull();
    expect(legacyHostRedirect(new URL("http://localhost:3000/dashboard"))).toBeNull();
    expect(legacyHostRedirect(new URL("https://exercise-webapp-git-x.vercel.app/"))).toBeNull();
  });
});
