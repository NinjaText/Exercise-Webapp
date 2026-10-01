import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StepForm } from "../step-form";

const steps = [
  { title: "About you", description: "Your name and contact details." },
  { title: "Health & history" },
  { title: "Training & goals" },
  { title: "Review" },
];

function render(props: Partial<React.ComponentProps<typeof StepForm>> = {}) {
  return renderToStaticMarkup(
    <StepForm steps={steps} step={0} onBack={vi.fn()} onContinue={vi.fn()} onFinish={vi.fn()} {...props}>
      <input id="field" />
    </StepForm>,
  );
}

const buttons = (html: string) => html.match(/<button[^>]*>.*?<\/button>/g) ?? [];

describe("StepForm", () => {
  it("shows 'Step n of N', the step list with the current step marked, and the step heading", () => {
    const html = render({ step: 1 });
    expect(html).toContain("Step 2 of 4");
    expect(html).toMatch(/<li[^>]*aria-current="step"[^>]*>.*?Health &amp; history/);
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    // The heading is focusable programmatically (focus moves to it on step change).
    expect(html).toMatch(/<h2[^>]*tabindex="-1"[^>]*>Health &amp; history<\/h2>/);
    expect(html).toContain('id="field"');
  });

  it("renders the step description under the heading", () => {
    expect(render({ step: 0 })).toContain("Your name and contact details.");
  });

  it("first step: no Back, a submit Continue", () => {
    const b = buttons(render({ step: 0 }));
    expect(b).toHaveLength(1);
    expect(b[0]).toContain('type="submit"');
    expect(b[0]).toContain("Continue");
  });

  it("middle step: Back (button) and Continue (submit)", () => {
    const b = buttons(render({ step: 1 }));
    expect(b).toHaveLength(2);
    expect(b[0]).toContain('type="button"');
    expect(b[0]).toContain("Back");
    expect(b[1]).toContain('type="submit"');
    expect(b[1]).toContain("Continue");
  });

  it("last step: 'Finish setup' by default, or a custom label", () => {
    expect(buttons(render({ step: 3 }))[1]).toContain("Finish setup");
    expect(buttons(render({ step: 3, submitLabel: "Create organization" }))[1]).toContain("Create organization");
  });

  it("disables the actions and marks the form busy while pending", () => {
    const html = render({ step: 3, pending: true });
    for (const b of buttons(html)) expect(b).toContain("disabled");
    expect(html).toContain('aria-busy="true"');
  });

  it("uses its own validation (noValidate) and a sticky, safe-area aware action bar", () => {
    const html = render({ step: 1 });
    expect(html).toMatch(/<form[^>]*novalidate/i);
    // Full-bleed fixed bar below lg; sticky inside the panel column at lg+.
    const bar = /data-slot="step-form-actions"[^>]*class="([^"]*)"/.exec(html)![1].split(" ");
    expect(bar).toEqual(expect.arrayContaining(["fixed", "inset-x-0", "bottom-0", "lg:sticky", "lg:inset-x-auto"]));
    expect(bar.some((c) => c.startsWith("-mx"))).toBe(false);
    expect(html).toContain("var(--safe-bottom)");
  });

  it("aligns the bar's content with the AuthShell column width", () => {
    expect(render({ step: 1 })).toContain("max-w-[640px]");
    expect(render({ step: 1, width: "default" })).toContain("max-w-[520px]");
  });

  it("Continue and Finish are distinct elements (no in-place relabel)", () => {
    // Keys aren't in markup; assert the last step has no Continue and vice versa.
    expect(render({ step: 2 })).not.toContain("Finish setup");
    expect(render({ step: 3 })).not.toContain(">Continue<");
  });

  it("a single-step form has no progress indicator", () => {
    const html = renderToStaticMarkup(
      <StepForm steps={[{ title: "Welcome" }]} step={0} onBack={vi.fn()} onContinue={vi.fn()} onFinish={vi.fn()}>
        <input />
      </StepForm>,
    );
    expect(html).not.toContain("Step 1 of 1");
    expect(html).not.toContain('data-slot="step-progress"');
    expect(buttons(html)).toHaveLength(1);
  });
});
