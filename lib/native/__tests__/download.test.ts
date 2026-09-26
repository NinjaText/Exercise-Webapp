import { describe, it, expect, vi } from "vitest";
import { safeFilename, saveOrDownload, type DownloadDeps } from "../download";

describe("safeFilename", () => {
  it("keeps ordinary names", () => expect(safeFilename("week-1.pdf")).toBe("week-1.pdf"));
  it("strips path separators and control characters", () => {
    expect(safeFilename("../../etc/pass\u0000wd.pdf")).toBe("etc_passwd.pdf");
    expect(safeFilename("a/b\\c.csv")).toBe("a_b_c.csv");
  });
  it("keeps the extension when truncating very long names", () => {
    const out = safeFilename(`${"x".repeat(300)}.pdf`);
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out.endsWith(".pdf")).toBe(true);
  });
  it("falls back when nothing usable remains", () => {
    expect(safeFilename("///", "program.pdf")).toBe("program.pdf");
  });
  it("keeps the extension when the sanitised body is all underscores", () => {
    expect(safeFilename("________.pdf")).toBe("download.pdf");
  });
  it("keeps the extension when the name is only an extension", () => {
    expect(safeFilename(".pdf")).toBe("download.pdf");
  });
  it("preserves emoji in the body", () => {
    expect(safeFilename("🏋️ Plan.pdf")).toBe("🏋️ Plan.pdf");
  });
  it("preserves non-Latin scripts in the body", () => {
    expect(safeFilename("腹筋トレーニング.pdf")).toBe("腹筋トレーニング.pdf");
  });
  it("truncates a very long extension-less name with no extension added back", () => {
    const out = safeFilename("x".repeat(300));
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out).not.toContain(".");
  });
});

function deps(overrides: Partial<DownloadDeps> = {}): DownloadDeps {
  return {
    isNative: () => true,
    webDownload: vi.fn(),
    writeCacheFile: vi.fn(async () => "file:///cache/x.pdf"),
    share: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("saveOrDownload", () => {
  const blob = new Blob(["hello"], { type: "application/pdf" });

  it("uses a normal download on the web", async () => {
    const d = deps({ isNative: () => false });
    await saveOrDownload(blob, "a.pdf", d);
    expect(d.webDownload).toHaveBeenCalledWith(blob, "a.pdf");
    expect(d.writeCacheFile).not.toHaveBeenCalled();
  });

  it("writes to the cache and opens the share sheet on native", async () => {
    const d = deps();
    await saveOrDownload(blob, "Week 1/Plan.pdf", d);
    expect(d.writeCacheFile).toHaveBeenCalledWith("Week 1_Plan.pdf", "aGVsbG8=");
    expect(d.share).toHaveBeenCalledWith({ title: "Week 1_Plan.pdf", files: ["file:///cache/x.pdf"] });
  });

  it("treats a cancelled share sheet as success", async () => {
    const d = deps({ share: vi.fn(async () => { throw new Error("Share canceled"); }) });
    await expect(saveOrDownload(blob, "a.pdf", d)).resolves.toBeUndefined();
  });

  it("propagates real failures so callers can show an error", async () => {
    const d = deps({ writeCacheFile: vi.fn(async () => { throw new Error("disk full"); }) });
    await expect(saveOrDownload(blob, "a.pdf", d)).rejects.toThrow("disk full");
  });
});
