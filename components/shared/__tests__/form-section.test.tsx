import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FormSection, FormField } from "../form-section";

describe("FormSection / FormField", () => {
  it("renders heading, description and children with a divider", () => {
    const html = renderToStaticMarkup(
      <FormSection title="Program Details" description="Name and type">
        <input />
      </FormSection>
    );
    expect(html).toContain("<h2");
    expect(html).toContain("Program Details");
    expect(html).toContain("Name and type");
    expect(html).toContain('data-slot="form-section"');
  });

  it("goes two-column only when its container is >=768px wide (narrow pages stay stacked)", () => {
    const html = renderToStaticMarkup(
      <FormSection title="Program Details" description="Name and type">
        <input />
      </FormSection>
    );
    expect(html).toMatch(/data-slot="form-section-container"[^>]*class="[^"]*@container/);
    expect(html).toMatch(/data-slot="form-section"[^>]*class="[^"]*\bgrid\b[^"]*@3xl:grid-cols-/);
    expect(html).not.toMatch(/\blg:grid-cols-/);
    expect(html).toMatch(/data-slot="form-section-fields"[^>]*class="[^"]*\bgap-4\b/);
  });

  it("separates two-column sections with a rule spaced evenly against the parent's 32px gap", () => {
    const html = renderToStaticMarkup(<FormSection title="A">x</FormSection>);
    expect(html).toMatch(/data-slot="form-section"[^>]*class="[^"]*@3xl:border-t\b[^"]*@3xl:pt-8\b/);
    expect(html).toContain("@3xl:group-first/form-section:border-t-0");
  });

  it("keeps a 6px label-to-input gap", () => {
    const html = renderToStaticMarkup(
      <FormField label="Name" htmlFor="name"><input id="name" /></FormField>
    );
    expect(html).toMatch(/data-slot="form-field"[^>]*class="[^"]*\bgap-1\.5\b/);
  });

  it("renders label, required marker and hint", () => {
    const html = renderToStaticMarkup(
      <FormField label="Name" htmlFor="name" required hint="Shown to clients">
        <input id="name" />
      </FormField>
    );
    expect(html).toContain('for="name"');
    expect(html).toContain("Name");
    expect(html).toContain('aria-hidden="true">*<');
    expect(html).toContain("Shown to clients");
    expect(html).not.toContain('role="alert"');
  });

  it("renders error instead of hint when both are given", () => {
    const html = renderToStaticMarkup(
      <FormField label="Name" htmlFor="name" hint="Shown to clients" error="Required">
        <input id="name" />
      </FormField>
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Required");
    expect(html).not.toContain("Shown to clients");
  });
});
