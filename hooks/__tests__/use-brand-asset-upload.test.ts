import { describe, it, expect, vi } from "vitest";

vi.mock("@/actions/branding-actions", () => ({
  confirmBrandAsset: vi.fn(),
  removeBrandAsset: vi.fn(),
}));

import { MAX_ASSET_BYTES } from "@/lib/branding/asset-kinds";
import {
  messageForUploadStatus,
  precheckBrandAssetFile,
  readUploadResponse,
} from "../use-brand-asset-upload";

describe("precheckBrandAssetFile", () => {
  it("accepts a PNG, JPEG or WebP at or under the size limit", () => {
    expect(precheckBrandAssetFile({ size: MAX_ASSET_BYTES, type: "image/png" })).toBeNull();
    expect(precheckBrandAssetFile({ size: 10, type: "image/jpeg" })).toBeNull();
    expect(precheckBrandAssetFile({ size: 10, type: "image/webp" })).toBeNull();
  });

  it("rejects an empty file", () => {
    expect(precheckBrandAssetFile({ size: 0, type: "image/png" })).toBe("That file is empty.");
  });

  it("rejects a file over the limit with the server's wording", () => {
    expect(precheckBrandAssetFile({ size: MAX_ASSET_BYTES + 1, type: "image/png" })).toBe(
      "Images must be 2 MB or smaller.",
    );
  });

  it("rejects other types (SVG, GIF, unknown)", () => {
    for (const type of ["image/svg+xml", "image/gif", ""]) {
      expect(precheckBrandAssetFile({ size: 10, type })).toBe("Upload a PNG, JPEG or WebP image.");
    }
  });
});

describe("messageForUploadStatus", () => {
  it("maps the route's statuses to readable messages", () => {
    expect(messageForUploadStatus(413)).toBe("Images must be 2 MB or smaller.");
    expect(messageForUploadStatus(415)).toBe("Upload a PNG, JPEG or WebP image.");
    expect(messageForUploadStatus(401)).toMatch(/sign in again/i);
    expect(messageForUploadStatus(403)).toMatch(/permission/i);
    expect(messageForUploadStatus(422)).toMatch(/couldn't use that image/i);
    expect(messageForUploadStatus(502)).toMatch(/try again/i);
  });

  it("has a generic fallback for anything else", () => {
    expect(messageForUploadStatus(418)).toBe("Upload failed. Please try again.");
  });

  it("maps a 404 (Clerk's auth.protect() on a signed-out API request) the same as a 401", () => {
    expect(messageForUploadStatus(404)).toBe(messageForUploadStatus(401));
    expect(messageForUploadStatus(404)).toBe(
      "Your session has expired. Refresh the page and sign in again.",
    );
  });
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

describe("readUploadResponse", () => {
  it("returns the pending keys on success", async () => {
    const result = await readUploadResponse(
      json(
        {
          pendingKeys: { primary: "branding-pending/org_1/a-mark.png", derivatives: ["x", "y"] },
        },
        200,
      ),
    );
    expect(result).toEqual({
      ok: true,
      pendingKeys: { primary: "branding-pending/org_1/a-mark.png", derivatives: ["x", "y"] },
    });
  });

  it("uses the server's JSON error message", async () => {
    const result = await readUploadResponse(json({ error: "Logos must be at least 64 px tall." }, 422));
    expect(result).toEqual({ ok: false, error: "Logos must be at least 64 px tall." });
  });

  it("falls back to a status message for a non-JSON 413 (Vercel's body cap page)", async () => {
    const res = new Response("<html><body>413 Request Entity Too Large</body></html>", {
      status: 413,
      headers: { "content-type": "text/html" },
    });
    expect(await readUploadResponse(res)).toEqual({ ok: false, error: "Images must be 2 MB or smaller." });
  });

  it("falls back to a status message when a JSON content type carries a broken body", async () => {
    const res = new Response("not json", { status: 500, headers: { "content-type": "application/json" } });
    expect(await readUploadResponse(res)).toEqual({
      ok: false,
      error: "Something went wrong processing that image.",
    });
  });

  it("falls back to a status message when the JSON error is not a usable string", async () => {
    expect(await readUploadResponse(json({ error: "" }, 403))).toEqual({
      ok: false,
      error: messageForUploadStatus(403),
    });
  });

  it("treats a 200 without well-formed pending keys as a failure", async () => {
    const result = await readUploadResponse(json({ pendingKeys: { primary: 1 } }, 200));
    expect(result.ok).toBe(false);
  });
});
