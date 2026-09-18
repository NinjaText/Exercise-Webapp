import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DataList, type Column } from "../data-list";

type Row = { id: string; name: string; sessions: number };
const columns: Column<Row>[] = [
  { key: "name", header: "Name" },
  { key: "sessions", header: "Sessions", align: "right" },
];
const rows: Row[] = [
  { id: "1", name: "Ada", sessions: 4 },
  { id: "2", name: "Grace", sessions: 9 },
];

describe("DataList", () => {
  it("renders headers and cells, right-aligning numeric columns", () => {
    const html = renderToStaticMarkup(
      <DataList columns={columns} data={rows} keyExtractor={(r) => r.id} />
    );
    expect(html).toContain("Name");
    expect(html).toContain("Ada");
    expect(html).toContain("text-right");
    expect(html).toContain("tabular-nums");
  });

  it("wraps the first cell in a link covering the row when rowHref is given", () => {
    const html = renderToStaticMarkup(
      <DataList columns={columns} data={rows} keyExtractor={(r) => r.id} rowHref={(r) => `/clients/${r.id}`} />
    );
    expect(html).toContain('href="/clients/1"');
    expect(html).toContain('data-clickable="true"');
    expect(html).toContain("after:absolute");
    expect(html.indexOf('href="/clients/1"')).toBeLessThan(html.indexOf("4"));
  });

  it("renders the emptyState node when there is no data", () => {
    const html = renderToStaticMarkup(
      <DataList columns={columns} data={[]} keyExtractor={(r) => r.id} emptyState={<div>Nothing here</div>} />
    );
    expect(html).toContain("Nothing here");
  });

  it("falls back to emptyMessage", () => {
    const html = renderToStaticMarkup(
      <DataList columns={columns} data={[]} keyExtractor={(r) => r.id} emptyMessage="No clients" />
    );
    expect(html).toContain("No clients");
  });

  it("makes onRowClick rows keyboard-focusable when there is no rowHref", () => {
    const html = renderToStaticMarkup(
      <DataList columns={columns} data={rows} keyExtractor={(r) => r.id} onRowClick={() => {}} />
    );
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('data-clickable="true"');
  });

  it("applies compact density and sticky header", () => {
    const html = renderToStaticMarkup(
      <DataList columns={columns} data={rows} keyExtractor={(r) => r.id} density="compact" stickyHeader />
    );
    expect(html).toContain('data-density="compact"');
    expect(html).toContain("sticky top-0");
  });

  it("makes the list its own scroll container when maxHeight is set", () => {
    const html = renderToStaticMarkup(
      <DataList columns={columns} data={rows} keyExtractor={(r) => r.id} maxHeight="70vh" stickyHeader />
    );
    expect(html).toMatch(/data-slot="table-container"[^>]*style="max-height:70vh"/);
    expect(html).toContain("overflow-y-auto");
    expect(html).toContain("sticky top-0");
  });

  it("renders rowHref rows without ClickableRow and onRowClick rows with it", () => {
    const hrefHtml = renderToStaticMarkup(
      <DataList columns={columns} data={rows} keyExtractor={(r) => r.id} rowHref={(r) => `/c/${r.id}`} />
    );
    expect(hrefHtml).not.toContain('tabindex="0"');
    const clickHtml = renderToStaticMarkup(
      <DataList columns={columns} data={rows} keyExtractor={(r) => r.id} onRowClick={() => {}} />
    );
    expect(clickHtml).toContain('tabindex="0"');
    expect(clickHtml).toContain('data-clickable="true"');
  });
});
