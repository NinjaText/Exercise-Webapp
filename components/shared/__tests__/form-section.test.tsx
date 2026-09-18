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
