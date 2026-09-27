import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PageHeader } from "../page-header";
import { Button } from "@/components/ui/button";

describe("PageHeader", () => {
  it("renders title, description and a back link", () => {
    const html = renderToStaticMarkup(
      <PageHeader
        title="Edit Program"
        description="Modify the program"
        back={{ label: "Back to program", href: "/programs/1" }}
      />
    );
    expect(html).toContain("<h1");
    expect(html).toContain("Edit Program");
    expect(html).toContain("Modify the program");
    expect(html).toContain('href="/programs/1"');
    expect(html).toContain("Back to program");
  });

  it("uses the title and body type scale and centers the actions on the title row", () => {
    const html = renderToStaticMarkup(
      <PageHeader title="Clients" description="Everyone you coach" primaryAction={<Button>Invite</Button>} />
    );
    expect(html).toMatch(/<h1[^>]*class="[^"]*\btext-title\b/);
    expect(html).toMatch(/<p[^>]*class="[^"]*\btext-body\b[^"]*text-muted-foreground/);
    expect(html).toContain("sm:items-center");
    expect(html).not.toContain("sm:items-baseline");
  });

  it("puts primaryAction and secondaryActions in the actions slot", () => {
    const html = renderToStaticMarkup(
      <PageHeader
        title="Clients"
        primaryAction={<Button>Invite Client</Button>}
        secondaryActions={<Button variant="outline">Export</Button>}
      />
    );
    expect(html).toContain('data-slot="page-header-actions"');
    expect(html).toContain("Invite Client");
    expect(html).toContain("Export");
  });

  it("treats the legacy `action` prop as the primary action", () => {
    const html = renderToStaticMarkup(<PageHeader title="Clients" action={<Button>Add</Button>} />);
    expect(html).toContain('data-slot="page-header-actions"');
    expect(html).toContain("Add");
  });

  it("renders an overflow trigger when overflow items are given", () => {
    const html = renderToStaticMarkup(
      <PageHeader title="Client" overflow={[{ label: "Archive", href: "/x" }]} />
    );
    expect(html).toContain('data-slot="page-header-overflow"');
  });

  it("renders an overflow trigger when only overflowLead items are given", () => {
    const html = renderToStaticMarkup(<PageHeader title="Client" overflowLead={<span>LEAD</span>} />);
    expect(html).toContain('data-slot="page-header-overflow"');
  });

  it("renders no overflow trigger without overflow items", () => {
    const html = renderToStaticMarkup(<PageHeader title="Client" overflow={[]} />);
    expect(html).not.toContain('data-slot="page-header-overflow"');
  });

  it("renders the tabs slot under the header", () => {
    const html = renderToStaticMarkup(<PageHeader title="Programs" tabs={<div>TABS</div>} />);
    expect(html).toContain('data-slot="page-header-tabs"');
    expect(html).toContain("TABS");
  });

  it("renders the meta slot above the tabs slot", () => {
    const html = renderToStaticMarkup(
      <PageHeader title="Programs" meta={<span>META</span>} tabs={<div>TABS</div>} />
    );
    expect(html).toContain('data-slot="page-header-meta"');
    expect(html).toContain("META");
    expect(html.indexOf('data-slot="page-header-meta"')).toBeLessThan(
      html.indexOf('data-slot="page-header-tabs"')
    );
  });
});
