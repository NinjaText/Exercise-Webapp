import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/actions/program-actions", () => ({}));
vi.mock("@/actions/ai-program-actions", () => ({}));
vi.mock("../program-builder", () => ({ ProgramBuilder: () => null }));

import { ProgramEditor } from "../program-editor";

const TABBAR_OFFSET = "bottom-[calc(var(--tab-bar-height)+var(--safe-bottom)+0.75rem)]";

describe("ProgramEditor sticky save bar", () => {
  it("clears the platform tab bar by default", () => {
    const html = renderToStaticMarkup(<ProgramEditor exercises={[]} />);
    expect(html).toContain(TABBAR_OFFSET);
  });

  it("sits at the safe-area edge when the shell has no tab bar", () => {
    const html = renderToStaticMarkup(<ProgramEditor exercises={[]} stickyOffset="none" />);
    expect(html).not.toContain(TABBAR_OFFSET);
    expect(html).toContain("bottom-[calc(var(--safe-bottom)+0.75rem)]");
  });
});
