import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// NativeProvider's resume-refresh effect calls useRouter(); the app router
// context isn't mounted under renderToStaticMarkup, so it's mocked here.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

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
});
