import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/components/marketing/marketing-nav", () => ({ MarketingNav: () => null }));

import { LegalDocument } from "../legal-document";
import { TERMS_OF_USE } from "@/lib/legal/documents/terms-of-use";
import { PRIVACY_POLICY } from "@/lib/legal/documents/privacy-policy";
import { CONSUMER_HEALTH_DATA_POLICY } from "@/lib/legal/documents/consumer-health-data";

describe("generated legal documents", () => {
  it("carry their dates and numbered section headings", () => {
    for (const doc of [TERMS_OF_USE, PRIVACY_POLICY, CONSUMER_HEALTH_DATA_POLICY]) {
      expect(doc.lastUpdated).toBe("November 6, 2026");
      expect(doc.effectiveDate).toBe("January 1, 2027");
      expect(doc.html).toContain('<h2 id="section-1">');
    }
    expect(TERMS_OF_USE.html).toContain("24. GOVERNING LAW AND DISPUTE RESOLUTION");
    expect(TERMS_OF_USE.html).toContain('<a href="/privacy">Privacy Policy</a>');
    expect(PRIVACY_POLICY.html).toContain('href="/consumer-health-data"');
    // The CHD notice is split out, not duplicated inside the general policy.
    expect(PRIVACY_POLICY.html).not.toContain("1. Consumer health data we collect");
  });
});

describe("LegalDocument", () => {
  it("renders title, dates, body and an appendix", () => {
    const html = renderToStaticMarkup(
      <LegalDocument doc={PRIVACY_POLICY} appendix={{ ...CONSUMER_HEALTH_DATA_POLICY, id: "consumer-health-data" }} />,
    );
    expect(html).toContain("Privacy Policy");
    expect(html).toContain("Last updated November 6, 2026");
    expect(html).toContain("Effective January 1, 2027");
    expect(html).toContain('id="consumer-health-data"');
    expect(html).toContain("Consumer Health Data Privacy Policy");
  });
});
