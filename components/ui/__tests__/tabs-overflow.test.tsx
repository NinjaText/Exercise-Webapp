import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Tabs, TabsList, TabsTrigger, tabsListVariants } from "../tabs";
import { PageHeader } from "@/components/shared/page-header";

function classesOf(html: string, slot: string) {
  const tag = html.match(new RegExp(`<[^>]*data-slot="${slot}"[^>]*>`))?.[0] ?? "";
  return (tag.match(/class="([^"]*)"/)?.[1] ?? "").replaceAll("&amp;", "&").split(" ");
}

const tabs = (
  <Tabs defaultValue="a">
    <TabsList variant="line">
      <TabsTrigger value="a">Overview</TabsTrigger>
      <TabsTrigger value="b">Progress</TabsTrigger>
    </TabsList>
  </Tabs>
);

// The list's base classes before the phone pass. Overflow must stay phone-only:
// `overflow-x: auto` also clips vertically, which would cut off the line
// variant's underline (it hangs 1px below the trigger) on laptops.
const PRE_CHANGE_LIST_BASE =
  "group/tabs-list inline-flex w-fit items-center justify-center text-muted-foreground group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col";

describe("Tabs overflow", () => {
  const html = renderToStaticMarkup(tabs);

  it("lets the list scroll sideways on phones, without a scrollbar", () => {
    const list = classesOf(html, "tabs-list");
    for (const c of [
      "max-sm:max-w-full",
      "max-sm:justify-start",
      "max-sm:overflow-x-auto",
      "[scrollbar-width:none]",
      "[&::-webkit-scrollbar]:hidden",
    ]) {
      expect(list).toContain(c);
    }
  });

  it("leaves the list's base classes unchanged from sm up", () => {
    const base = tabsListVariants({ variant: "line" }).split(" ");
    const phoneOnly = new Set(["[scrollbar-width:none]", "[&::-webkit-scrollbar]:hidden"]);
    const kept = base.filter((t) => !t.startsWith("max-sm:") && !phoneOnly.has(t));
    expect(kept.join(" ")).toContain(PRE_CHANGE_LIST_BASE);
  });

  it("keeps triggers at their natural width while still sharing space", () => {
    const trigger = classesOf(html, "tabs-trigger");
    expect(trigger).toContain("shrink-0");
    expect(trigger).toContain("flex-1");
  });

  it("lifts the line underline inside the scrolling list on phones only", () => {
    const trigger = classesOf(html, "tabs-trigger");
    expect(trigger).toContain("group-data-horizontal/tabs:after:-bottom-px");
    expect(trigger).toContain("max-sm:group-data-horizontal/tabs:after:bottom-0");
  });

  it("lets the PageHeader tabs slot shrink and scroll within the page", () => {
    const header = renderToStaticMarkup(<PageHeader title="Client" tabs={tabs} />);
    const wrapper = classesOf(header, "page-header-tabs");
    for (const c of ["min-w-0", "max-w-full", "max-sm:overflow-x-auto"]) {
      expect(wrapper).toContain(c);
    }
  });
});
