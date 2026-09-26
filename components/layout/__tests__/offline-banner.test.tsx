import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OfflineBanner } from "../offline-banner";

describe("OfflineBanner", () => {
  it("renders nothing while online, which is the default context", () => {
    expect(renderToStaticMarkup(<OfflineBanner />)).toBe("");
  });
});
