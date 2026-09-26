import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/push-device.service", () => ({
  isValidPushToken: vi.fn(),
  unregisterToken: vi.fn(),
}));

import { isValidPushToken, unregisterToken } from "@/lib/services/push-device.service";
import { POST } from "../route";

const url = "https://app.test/api/push/unregister";
const post = (body: unknown) =>
  POST(
    new Request(url, {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/push/unregister", () => {
  it("unregisters a valid token with no auth check, unscoped by user", async () => {
    vi.mocked(isValidPushToken).mockReturnValue(true);

    const res = await post({ token: "tok_abc" });

    expect(res.status).toBe(204);
    expect(unregisterToken).toHaveBeenCalledWith("tok_abc");
    expect(unregisterToken).toHaveBeenCalledTimes(1);
  });

  it("returns 400 for a token that fails validation", async () => {
    vi.mocked(isValidPushToken).mockReturnValue(false);

    const res = await post({ token: "" });

    expect(res.status).toBe(400);
    expect(unregisterToken).not.toHaveBeenCalled();
  });

  it("returns 400 when the body has no token", async () => {
    vi.mocked(isValidPushToken).mockReturnValue(false);

    const res = await post({});

    expect(res.status).toBe(400);
    expect(unregisterToken).not.toHaveBeenCalled();
  });

  it("returns 400 on malformed JSON instead of throwing", async () => {
    const res = await post("not json");

    expect(res.status).toBe(400);
    expect(unregisterToken).not.toHaveBeenCalled();
  });
});
