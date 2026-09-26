import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NativePurchaseNotice } from "../native-purchase-notice";

describe("NativePurchaseNotice", () => {
  it("states availability neutrally with no price, button or link", () => {
    const html = renderToStaticMarkup(<NativePurchaseNotice />);
    expect(html).toContain("available on our website");
    expect(html).not.toMatch(/\$\d/);
    expect(html).not.toMatch(/<a\b|<button\b/);
  });
});
