import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The real AlertDialog portals its content and only renders when mounted in a
// browser, so the shell parts are stubbed; AlertDialogAction stays real (it is
// a plain Button) so the rendered variant classes are the real ones.
vi.mock("@/components/ui/alert-dialog", async (importActual) => {
  const actual = await importActual<typeof import("@/components/ui/alert-dialog")>();
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    AlertDialog: Pass,
    AlertDialogContent: Pass,
    AlertDialogHeader: Pass,
    AlertDialogFooter: Pass,
    AlertDialogTitle: Pass,
    AlertDialogDescription: Pass,
    AlertDialogCancel: ({ children }: { children?: React.ReactNode }) => <button>{children}</button>,
    AlertDialogAction: actual.AlertDialogAction,
  };
});

import { ConfirmDialog } from "../confirm-dialog";

const base = {
  open: true,
  onOpenChange: () => {},
  title: "Delete client?",
  description: "This cannot be undone.",
  confirmLabel: "Delete",
  onConfirm: () => {},
};

function confirmButton(html: string) {
  const match = html.match(/<button[^>]*data-slot="alert-dialog-action"[^>]*>/);
  expect(match).not.toBeNull();
  return match![0];
}

describe("ConfirmDialog", () => {
  it("renders the Button destructive variant for a destructive confirm", () => {
    const btn = confirmButton(renderToStaticMarkup(<ConfirmDialog {...base} variant="destructive" />));
    expect(btn).toContain("bg-destructive/10");
    expect(btn).toContain("text-destructive");
    expect(btn).not.toContain("bg-primary");
    expect(btn).not.toContain("text-destructive-foreground");
  });

  it("renders the default (primary) variant otherwise", () => {
    const btn = confirmButton(renderToStaticMarkup(<ConfirmDialog {...base} />));
    expect(btn).toContain("bg-primary");
    expect(btn).not.toContain("bg-destructive");
  });
});
