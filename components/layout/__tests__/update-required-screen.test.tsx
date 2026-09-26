import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { UpdateRequiredScreen } from "../update-required-screen";

describe("UpdateRequiredScreen", () => {
  it("renders the title and alertdialog role", () => {
    const html = renderToStaticMarkup(
      <UpdateRequiredScreen platform="ios" storeUrl={null} onOpenStore={vi.fn()} />
    );
    expect(html).toContain("Update required");
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('aria-modal="true"');
  });

  it("is focusable and describes itself via an id that exists in the markup", () => {
    const html = renderToStaticMarkup(
      <UpdateRequiredScreen platform="ios" storeUrl={null} onOpenStore={vi.fn()} />
    );
    expect(html).toContain('tabindex="-1"');
    const match = /aria-describedby="([^"]+)"/.exec(html);
    expect(match).not.toBeNull();
    const describedById = match![1];
    expect(html).toContain(`id="${describedById}"`);
  });

  it("names the App Store on iOS", () => {
    const html = renderToStaticMarkup(
      <UpdateRequiredScreen platform="ios" storeUrl="https://apps.apple.com/app/id1" onOpenStore={vi.fn()} />
    );
    expect(html).toContain("the App Store");
    expect(html).not.toContain("Google Play");
  });

  it("names Google Play on Android", () => {
    const html = renderToStaticMarkup(
      <UpdateRequiredScreen platform="android" storeUrl="https://play.google.com/store/apps/details?id=x" onOpenStore={vi.fn()} />
    );
    expect(html).toContain("Google Play");
    expect(html).not.toContain("the App Store");
  });

  it("renders no button when storeUrl is null", () => {
    const html = renderToStaticMarkup(
      <UpdateRequiredScreen platform="ios" storeUrl={null} onOpenStore={vi.fn()} />
    );
    expect(html).not.toMatch(/<button\b/);
  });

  it("renders a button that opens the store URL when present", () => {
    const html = renderToStaticMarkup(
      <UpdateRequiredScreen platform="android" storeUrl="https://play.google.com/store/apps/details?id=x" onOpenStore={vi.fn()} />
    );
    expect(html).toMatch(/<button\b/);
    expect(html).toContain("Open Google Play");
  });
});
