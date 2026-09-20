import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LegalDocument } from "../legal-document";
import { PRIVACY_POLICY } from "@/lib/legal/privacy-policy";
import { TERMS_OF_SERVICE } from "@/lib/legal/terms-of-service";

describe("LegalDocument", () => {
  it("renders the title, last-updated date, and every section heading", () => {
    const html = renderToStaticMarkup(<LegalDocument doc={PRIVACY_POLICY} />);
    expect(html).toContain("Privacy Policy");
    expect(html).toContain(PRIVACY_POLICY.lastUpdated);
    for (const section of PRIVACY_POLICY.sections) {
      expect(html).toContain(section.heading);
    }
  });

  it("renders terms with a health disclaimer section", () => {
    const html = renderToStaticMarkup(<LegalDocument doc={TERMS_OF_SERVICE} />);
    expect(html).toContain("Terms of Service");
    expect(TERMS_OF_SERVICE.sections.some((s) => /not medical advice/i.test(s.paragraphs.join(" ")))).toBe(true);
  });
});
