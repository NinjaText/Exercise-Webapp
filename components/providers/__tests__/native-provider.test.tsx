import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// NativeProvider's resume-refresh effect calls useRouter(); the app router
// context isn't mounted under renderToStaticMarkup, so it's mocked here.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
// The push effects read Clerk's session; ClerkProvider isn't mounted here.
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ isLoaded: false, isSignedIn: undefined, userId: null }) }));
vi.mock("@/actions/push-actions", () => ({ registerPushDeviceAction: vi.fn() }));

import { NativeProvider, useNative } from "../native-provider";

function Probe() {
  const { isNative, platform, isOnline } = useNative();
  return <span data-native={String(isNative)} data-platform={platform ?? "web"} data-online={String(isOnline)} />;
}

describe("NativeProvider", () => {
  it("renders as web and online on the server pass", () => {
    const html = renderToStaticMarkup(
      <NativeProvider>
        <Probe />
      </NativeProvider>
    );
    expect(html).toContain('data-native="false"');
    expect(html).toContain('data-platform="web"');
    expect(html).toContain('data-online="true"');
  });

  it("defaults to web when used without a provider", () => {
    const html = renderToStaticMarkup(<Probe />);
    expect(html).toContain('data-native="false"');
  });

  // No update is required on this static server pass (the version-gate
  // effect that could set it never runs under renderToStaticMarkup), so this
  // covers only the default, unblocked state; UpdateRequiredScreen's own
  // focus/inert-target markup is covered by its own component test.
  it("renders children through a non-inert, non-hidden wrapper when no update is required", () => {
    const html = renderToStaticMarkup(
      <NativeProvider>
        <Probe />
      </NativeProvider>
    );
    expect(html).toContain('data-native="false"');
    expect(html).not.toContain("inert");
    expect(html).not.toContain("aria-hidden");
  });
});
