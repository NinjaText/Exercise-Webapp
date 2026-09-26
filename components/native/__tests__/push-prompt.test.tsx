import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PushPrompt } from "../push-prompt";

// The show/hide decision lives in shouldShowPushPrompt (lib/native/push.ts),
// covered by its own tests. Here: the component is inert on the web.
describe("PushPrompt", () => {
  it("renders nothing on the web", () => {
    expect(renderToStaticMarkup(<PushPrompt />)).toBe("");
  });
});
