import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/native/server", () => ({ getNativeInfo: vi.fn() }));
vi.mock("@/lib/services/sellable-package.service", () => ({ getSellablePackageBySlug: vi.fn() }));
vi.mock("@/lib/payments/program-checkout", () => ({ createProgramCheckoutSession: vi.fn() }));

import { getNativeInfo } from "@/lib/native/server";
import { getSellablePackageBySlug } from "@/lib/services/sellable-package.service";
import { POST } from "../route";

const req = () => new Request("https://app.test/api/checkout/program", { method: "POST", body: JSON.stringify({ slug: "x" }) });

describe("POST /api/checkout/program", () => {
  it("refuses requests from the native shell before touching packages", async () => {
    vi.mocked(getNativeInfo).mockResolvedValue({ isNative: true, platform: "android", appVersion: "1.0.0" });
    const res = await POST(req());
    expect(res.status).toBe(403);
    expect(getSellablePackageBySlug).not.toHaveBeenCalled();
  });

  it("proceeds normally on the web", async () => {
    vi.mocked(getNativeInfo).mockResolvedValue({ isNative: false });
    vi.mocked(getSellablePackageBySlug).mockResolvedValue(null as never);
    expect((await POST(req())).status).toBe(404);
  });
});
