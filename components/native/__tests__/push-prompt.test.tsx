import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PushPrompt } from "../push-prompt";

// The show/hide decision lives in shouldShowPushPrompt (lib/native/push.ts),
// covered by its own tests. Here: the component is inert on the web. The Sheet
// stays mounted (closed) so its exit animation can play; closed, it renders
// no markup at all.
describe("PushPrompt", () => {
  it("renders nothing on the web", () => {
    expect(renderToStaticMarkup(<PushPrompt />)).toBe("");
  });

  it("keeps the Sheet mounted and drives it closed through `open`", async () => {
    vi.resetModules();
    vi.doMock("@/components/ui/sheet", () => {
      const Pass = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
      return {
        Sheet: ({ open }: { open: boolean }) => <div data-testid="sheet" data-open={String(open)} />,
        SheetContent: Pass,
        SheetDescription: Pass,
        SheetFooter: Pass,
        SheetHeader: Pass,
        SheetTitle: Pass,
      };
    });
    try {
      const { PushPrompt: Mocked } = await import("../push-prompt");
      expect(renderToStaticMarkup(<Mocked />)).toBe('<div data-testid="sheet" data-open="false"></div>');
    } finally {
      vi.doUnmock("@/components/ui/sheet");
      vi.resetModules();
    }
  });
});
