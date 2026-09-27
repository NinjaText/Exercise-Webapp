import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

vi.mock("server-only", () => ({}));

const mockSend = vi.fn();
vi.mock("@/lib/r2", () => ({
  R2_BUCKET_NAME: "test-bucket",
  getR2Client: () => ({ send: mockSend }),
}));

import { AssetError, deleteBrandAssets, processBrandAsset } from "../assets";

// ---------------------------------------------------------------------------
// Real images generated with sharp
// ---------------------------------------------------------------------------

function solid(width: number, height: number, alpha = 1) {
  return sharp({
    create: { width, height, channels: 4, background: { r: 200, g: 30, b: 60, alpha } },
  });
}

const png = (w: number, h: number) => solid(w, h, 0.5).png().toBuffer();
const jpeg = (w: number, h: number) => solid(w, h).jpeg().toBuffer();
const webp = (w: number, h: number) => solid(w, h, 0.5).webp().toBuffer();

async function expectAssetError(p: Promise<unknown>, code: string) {
  const err = await p.then(
    () => {
      throw new Error("expected rejection");
    },
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AssetError);
  expect((err as AssetError).code).toBe(code);
}

describe("processBrandAsset — logos", () => {
  it("re-encodes a 300x100 PNG logo to PNG, unchanged size (no enlargement)", async () => {
    const { primary, derivatives } = await processBrandAsset(await png(300, 100), "logo-on-light");
    const meta = await sharp(primary).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(300);
    expect(meta.height).toBe(100);
    expect(meta.hasAlpha).toBe(true);
    expect(derivatives).toEqual([]);
  });

  it("downsizes a large logo to fit 1024x256", async () => {
    const { primary } = await processBrandAsset(await jpeg(2000, 1000), "logo-on-dark");
    const meta = await sharp(primary).metadata();
    expect(meta.format).toBe("png");
    expect(meta.height).toBeLessThanOrEqual(256);
    expect(meta.width).toBeLessThanOrEqual(1024);
    expect(meta.width).toBe(512);
  });

  it("caps width at 1024 for very wide logos", async () => {
    const { primary } = await processBrandAsset(await png(4000, 400), "logo-on-light");
    const meta = await sharp(primary).metadata();
    expect(meta.width).toBe(1024);
    expect(meta.height).toBeLessThanOrEqual(256);
  });

  it("accepts WebP input and outputs PNG", async () => {
    const { primary } = await processBrandAsset(await webp(400, 128), "logo-on-light");
    expect((await sharp(primary).metadata()).format).toBe("png");
  });

  it("rejects a logo shorter than 64 px", async () => {
    await expectAssetError(processBrandAsset(await png(300, 63), "logo-on-light"), "dimensions");
  });
});

describe("processBrandAsset — mark", () => {
  it("returns a 512x512 PNG with alpha plus favicon-32 and apple-180", async () => {
    const { primary, derivatives } = await processBrandAsset(await jpeg(200, 200), "mark");
    const meta = await sharp(primary).metadata();
    expect(meta).toMatchObject({ format: "png", width: 512, height: 512, hasAlpha: true });

    expect(derivatives.map((d) => d.suffix)).toEqual(["favicon-32", "apple-180"]);
    const [fav, apple] = await Promise.all(derivatives.map((d) => sharp(d.buffer).metadata()));
    expect(fav).toMatchObject({ format: "png", width: 32, height: 32 });
    expect(apple).toMatchObject({ format: "png", width: 180, height: 180 });
  });

  it("contain-fits a non-square mark with transparent padding", async () => {
    const { primary } = await processBrandAsset(await jpeg(400, 200), "mark");
    const { data, info } = await sharp(primary).raw().toBuffer({ resolveWithObject: true });
    expect(info).toMatchObject({ width: 512, height: 512, channels: 4 });
    // Top-left corner is padding → fully transparent.
    expect(data[3]).toBe(0);
    // Centre is image → opaque.
    const centre = (256 * 512 + 256) * 4;
    expect(data[centre + 3]).toBe(255);
  });

  it("rejects a 40x40 mark", async () => {
    await expectAssetError(processBrandAsset(await png(40, 40), "mark"), "dimensions");
  });

  it("rejects a mark under 128 in one dimension", async () => {
    await expectAssetError(processBrandAsset(await png(300, 127), "mark"), "dimensions");
  });

  it("tells the user the minimum size for the slot", async () => {
    await expect(processBrandAsset(await png(100, 100), "mark")).rejects.toThrow(
      "at least 128 × 128 px",
    );
    await expect(processBrandAsset(await png(300, 63), "logo-on-light")).rejects.toThrow(
      "at least 64 px tall",
    );
    await expect(processBrandAsset(await png(4097, 200), "logo-on-dark")).rejects.toThrow(
      "no bigger than 4096 × 4096 px",
    );
  });
});

describe("processBrandAsset — rejection", () => {
  it("rejects SVG even when it decodes (sharp reports svg)", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><script>alert(1)</script><rect width="300" height="300" fill="red"/></svg>',
    );
    await expectAssetError(processBrandAsset(svg, "mark"), "format");
  });

  it("rejects other decodable formats (GIF, TIFF)", async () => {
    await expectAssetError(
      processBrandAsset(await solid(200, 200).gif().toBuffer(), "mark"),
      "format",
    );
    await expectAssetError(
      processBrandAsset(await solid(200, 200).tiff().toBuffer(), "mark"),
      "format",
    );
  });

  it("rejects a 5000x10 image on dimensions", async () => {
    await expectAssetError(processBrandAsset(await png(5000, 10), "logo-on-light"), "dimensions");
  });

  it("rejects an image above 4096 on either side even when otherwise valid", async () => {
    await expectAssetError(processBrandAsset(await png(4097, 200), "logo-on-light"), "dimensions");
  });

  it("maps sharp's pixel-limit error (header over 4096x4096 px) to dimensions, not decode", async () => {
    const huge = await sharp({
      create: { width: 4200, height: 4200, channels: 3, background: "#ffffff" },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(huge.length).toBeLessThan(2 * 1024 * 1024);
    await expectAssetError(processBrandAsset(huge, "mark"), "dimensions");
  });

  it("rejects a text buffer and never resolves", async () => {
    const result = processBrandAsset(Buffer.from("hello, definitely not an image"), "mark");
    await expect(result).rejects.toBeInstanceOf(AssetError);
  });

  it("rejects an empty buffer", async () => {
    await expect(processBrandAsset(Buffer.alloc(0), "mark")).rejects.toBeInstanceOf(AssetError);
  });

  it("rejects a buffer over 2 MB before decoding", async () => {
    await expectAssetError(processBrandAsset(Buffer.alloc(2 * 1024 * 1024 + 1), "mark"), "size");
  });

  it("rejects an unknown kind", async () => {
    await expect(processBrandAsset(await png(300, 300), "banner" as never)).rejects.toThrow();
  });

  it("rejects animated (multi-page) input", async () => {
    const frame = (background: string) =>
      sharp({ create: { width: 200, height: 200, channels: 4, background } }).png().toBuffer();
    const animated = await sharp([await frame("#ff0000"), await frame("#00ff00")], {
      join: { animated: true },
    })
      .webp({ loop: 0 })
      .toBuffer();
    expect((await sharp(animated).metadata()).pages).toBe(2);
    await expectAssetError(processBrandAsset(animated, "mark"), "animated");
  });
});

describe("processBrandAsset — sanitisation", () => {
  it("strips EXIF/ICC metadata and applies EXIF orientation", async () => {
    // 300x150 landscape pixels tagged orientation 6 (rotate 90° CW) → displays 150x300.
    const input = await solid(300, 150)
      .jpeg()
      .withMetadata({ orientation: 6, exif: { IFD0: { Copyright: "secret-gps-owner" } } })
      .toBuffer();
    const inMeta = await sharp(input).metadata();
    expect(inMeta.orientation).toBe(6);
    expect(inMeta.exif).toBeDefined();

    const { primary } = await processBrandAsset(input, "logo-on-light");
    const meta = await sharp(primary).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    // Displayed 150x300 → fit inside 1024x256 → 128x256 (portrait, so rotation applied).
    expect(meta.width).toBe(128);
    expect(meta.height).toBe(256);
    expect(primary.includes(Buffer.from("secret-gps-owner"))).toBe(false);
  });

  it("measures limits after orientation (a 60-wide, 300-tall-by-EXIF image passes as a logo)", async () => {
    // Stored 300x60 (too short for a logo) but orientation 6 → displays 60x300.
    const input = await solid(300, 60).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const { primary } = await processBrandAsset(input, "logo-on-light");
    const meta = await sharp(primary).metadata();
    expect(meta.height).toBe(256);
  });
});

// ---------------------------------------------------------------------------
// deleteBrandAssets
// ---------------------------------------------------------------------------

describe("deleteBrandAssets", () => {
  const ORG = "org_2abc";

  beforeEach(() => {
    mockSend.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists BOTH org prefixes (final + pending, trailing slash) and deletes every key", async () => {
    mockSend.mockImplementation(async (cmd: unknown) => {
      if (cmd instanceof ListObjectsV2Command) {
        if (cmd.input.Prefix === `branding/${ORG}/`) {
          return { Contents: [{ Key: `branding/${ORG}/mark-aaaaaaaa.png` }], IsTruncated: false };
        }
        if (cmd.input.Prefix === `branding-pending/${ORG}/`) {
          return { Contents: [{ Key: `branding-pending/${ORG}/x-mark.png` }], IsTruncated: false };
        }
      }
      return {};
    });

    await deleteBrandAssets(ORG);

    const cmds = mockSend.mock.calls.map((c) => c[0]);
    const lists = cmds.filter((c) => c instanceof ListObjectsV2Command);
    expect(lists.map((l) => l.input)).toEqual([
      expect.objectContaining({ Bucket: "test-bucket", Prefix: `branding/${ORG}/` }),
      expect.objectContaining({ Bucket: "test-bucket", Prefix: `branding-pending/${ORG}/` }),
    ]);

    const dels = cmds.filter((c) => c instanceof DeleteObjectsCommand);
    expect(dels.map((d) => d.input)).toEqual([
      {
        Bucket: "test-bucket",
        Delete: { Objects: [{ Key: `branding/${ORG}/mark-aaaaaaaa.png` }], Quiet: true },
      },
      {
        Bucket: "test-bucket",
        Delete: { Objects: [{ Key: `branding-pending/${ORG}/x-mark.png` }], Quiet: true },
      },
    ]);
  });

  it("never deletes a listed key outside the prefix being cleared", async () => {
    mockSend.mockImplementation(async (cmd: unknown) => {
      if (cmd instanceof ListObjectsV2Command) {
        return {
          Contents: [{ Key: `${cmd.input.Prefix}a.png` }, { Key: `branding/${ORG}0/evil.png` }],
          IsTruncated: false,
        };
      }
      return {};
    });
    await deleteBrandAssets(ORG);
    const deleted = mockSend.mock.calls
      .map((c) => c[0])
      .filter((c) => c instanceof DeleteObjectsCommand)
      .flatMap((d) => (d.input.Delete?.Objects ?? []).map((o: { Key?: string }) => o.Key));
    expect(deleted).toEqual([`branding/${ORG}/a.png`, `branding-pending/${ORG}/a.png`]);
  });

  it("still clears the pending prefix when the final prefix fails", async () => {
    mockSend.mockImplementation(async (cmd: unknown) => {
      if (cmd instanceof ListObjectsV2Command) {
        if (cmd.input.Prefix === `branding/${ORG}/`) throw new Error("R2 down");
        return { Contents: [{ Key: `branding-pending/${ORG}/p.png` }], IsTruncated: false };
      }
      return {};
    });
    await expect(deleteBrandAssets(ORG)).resolves.toBeUndefined();
    const dels = mockSend.mock.calls.map((c) => c[0]).filter((c) => c instanceof DeleteObjectsCommand);
    expect(dels).toHaveLength(1);
    expect(dels[0].input.Delete?.Objects).toEqual([{ Key: `branding-pending/${ORG}/p.png` }]);
    expect(console.error).toHaveBeenCalled();
  });

  it("follows continuation tokens and batches > 1000 keys", async () => {
    const page1 = Array.from({ length: 1500 }, (_, i) => ({ Key: `branding/${ORG}/a${i}.png` }));
    const page2 = [{ Key: `branding/${ORG}/last.png` }];
    mockSend.mockImplementation(async (cmd: unknown) => {
      if (cmd instanceof ListObjectsV2Command) {
        if (cmd.input.Prefix !== `branding/${ORG}/`) return { IsTruncated: false };
        return cmd.input.ContinuationToken === "t2"
          ? { Contents: page2, IsTruncated: false }
          : { Contents: page1, IsTruncated: true, NextContinuationToken: "t2" };
      }
      return {};
    });

    await deleteBrandAssets(ORG);

    const lists = mockSend.mock.calls.map((c) => c[0]).filter((c) => c instanceof ListObjectsV2Command);
    const dels = mockSend.mock.calls.map((c) => c[0]).filter((c) => c instanceof DeleteObjectsCommand);
    expect(lists).toHaveLength(3); // 2 pages of branding/ + 1 of branding-pending/
    expect(lists[1].input.ContinuationToken).toBe("t2");
    expect(dels.map((d) => d.input.Delete?.Objects?.length)).toEqual([1000, 500, 1]);
    const deleted = dels.flatMap((d) => (d.input.Delete?.Objects ?? []).map((o) => o.Key));
    expect(new Set(deleted).size).toBe(1501);
  });

  it("makes no delete call when both prefixes are empty", async () => {
    mockSend.mockResolvedValue({ IsTruncated: false });
    await deleteBrandAssets(ORG);
    expect(mockSend).toHaveBeenCalledTimes(2); // one list per prefix
  });

  it("stops if R2 claims truncation without a token", async () => {
    mockSend.mockResolvedValue({ Contents: [], IsTruncated: true });
    await deleteBrandAssets(ORG);
    expect(mockSend).toHaveBeenCalledTimes(2); // one list per prefix, no loop
  });

  it("never throws when R2 fails, and logs only a safe error summary (no raw SDK error)", async () => {
    mockSend.mockRejectedValue(new Error("R2 down"));
    await expect(deleteBrandAssets(ORG)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
    const call = vi
      .mocked(console.error)
      .mock.calls.find((c: unknown[]) => String(c[0]).includes("deleteBrandAssets failed"));
    expect(call?.[1]).toEqual({ name: "Error", message: "R2 down", httpStatusCode: undefined });
  });

  it("never throws when DeleteObjects reports per-key errors", async () => {
    mockSend
      .mockResolvedValueOnce({ Contents: [{ Key: `branding/${ORG}/a.png` }], IsTruncated: false })
      .mockResolvedValueOnce({ Errors: [{ Key: `branding/${ORG}/a.png`, Code: "AccessDenied" }] })
      .mockResolvedValue({ IsTruncated: false });
    await expect(deleteBrandAssets(ORG)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it.each(["", "../other", "org/1", "org_1/.."])(
    "does not touch R2 for an unsafe org id %j",
    async (org) => {
      await expect(deleteBrandAssets(org)).resolves.toBeUndefined();
      expect(mockSend).not.toHaveBeenCalled();
    },
  );
});
