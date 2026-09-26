import "server-only";

/**
 * Server-only brand asset operations (spec §6.2): decoder-verified validation
 * and PNG re-encoding with sharp, and best-effort R2 cleanup. Constants, key
 * helpers and URL checks live in the browser-safe `./asset-kinds`.
 */
import sharp from "sharp";
import { DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { R2_BUCKET_NAME, getR2Client } from "@/lib/r2";
import { r2ErrorSummary } from "@/lib/r2-errors";
import {
  ASSET_LIMITS,
  MAX_ASSET_BYTES,
  brandingPrefix,
  isAssetKind,
  pendingPrefix,
  type AssetKind,
  type DerivativeSuffix,
} from "./asset-kinds";

export * from "./asset-kinds";

export type AssetErrorCode = "size" | "decode" | "format" | "animated" | "dimensions";

const ASSET_ERROR_MESSAGES: Record<AssetErrorCode, string> = {
  size: "Images must be 2 MB or smaller.",
  decode: "That file could not be read as an image.",
  format: "Upload a PNG, JPEG or WebP image.",
  animated: "Animated images are not supported.",
  dimensions: "That image is too small or too large for this slot.",
};

/** A user-facing rejection of an uploaded image; `code` drives the message. */
export class AssetError extends Error {
  readonly code: AssetErrorCode;

  constructor(code: AssetErrorCode, message = ASSET_ERROR_MESSAGES[code]) {
    super(message);
    this.name = "AssetError";
    this.code = code;
  }
}

export type ProcessedBrandAsset = {
  primary: Buffer;
  derivatives: Array<{ suffix: DerivativeSuffix; buffer: Buffer }>;
};

const ALLOWED_FORMATS = new Set(["png", "jpeg", "webp"]);

/**
 * Decompression-bomb guard for the pixel pipeline. `metadata()` only reads the
 * header; the dimension check below rejects oversize images before decoding.
 */
const SHARP_INPUT = { limitInputPixels: 4096 * 4096 } as const;

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/**
 * Validates an upload with the real decoder and re-encodes it to PNG.
 *
 * Re-encoding drops all metadata (sharp strips EXIF/ICC/XMP unless
 * `keepMetadata`/`withMetadata` is called — we never call them), applies EXIF
 * orientation, and turns anything malicious-but-valid into plain pixels.
 *
 * @throws AssetError for anything that is not an acceptable image for `kind`.
 */
export async function processBrandAsset(
  input: Buffer,
  kind: AssetKind,
): Promise<ProcessedBrandAsset> {
  if (!isAssetKind(kind)) throw new Error("Invalid brand asset kind");
  if (!Buffer.isBuffer(input) || input.length === 0) throw new AssetError("decode");
  if (input.length > MAX_ASSET_BYTES) throw new AssetError("size");

  let meta: sharp.Metadata;
  try {
    meta = await sharp(input, SHARP_INPUT).metadata();
  } catch (error) {
    // `limitInputPixels` makes the header read itself fail for oversize
    // images ("Input image exceeds pixel limit"): that is a size problem, not
    // an unreadable file.
    if (error instanceof Error && /pixel limit/i.test(error.message)) {
      throw new AssetError(
        "dimensions",
        `That image is too large. Use one no bigger than ${ASSET_LIMITS[kind].maxDim} × ${ASSET_LIMITS[kind].maxDim} px.`,
      );
    }
    throw new AssetError("decode");
  }

  // Format first: an SVG (sharp reports "svg") is rejected here whatever its size.
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) throw new AssetError("format");
  if ((meta.pages ?? 1) > 1) throw new AssetError("animated");

  // Limits apply to the displayed image, i.e. after EXIF orientation.
  const width = meta.autoOrient?.width ?? meta.width;
  const height = meta.autoOrient?.height ?? meta.height;
  const limits = ASSET_LIMITS[kind];
  if (!width || !height || width > limits.maxDim || height > limits.maxDim) {
    throw new AssetError(
      "dimensions",
      `That image is too large. Use one no bigger than ${limits.maxDim} × ${limits.maxDim} px.`,
    );
  }
  if (width < limits.minWidth || height < limits.minHeight) {
    throw new AssetError(
      "dimensions",
      kind === "mark"
        ? `That image is too small. Use a square image at least ${limits.minWidth} × ${limits.minHeight} px.`
        : `That image is too small. Use one at least ${limits.minHeight} px tall.`,
    );
  }

  try {
    const base = sharp(input, SHARP_INPUT).rotate();

    if (kind !== "mark") {
      const primary = await base
        .resize({ height: 256, width: 1024, fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer();
      return { primary, derivatives: [] };
    }

    const primary = await base
      .resize(512, 512, { fit: "contain", background: TRANSPARENT })
      .ensureAlpha()
      .png()
      .toBuffer();

    const derive = (size: number) =>
      sharp(primary).resize(size, size, { fit: "contain", background: TRANSPARENT }).png().toBuffer();
    const [favicon, apple] = await Promise.all([derive(32), derive(180)]);

    return {
      primary,
      derivatives: [
        { suffix: "favicon-32", buffer: favicon },
        { suffix: "apple-180", buffer: apple },
      ],
    };
  } catch {
    // A header that parsed but pixels that don't (truncated/corrupt data).
    throw new AssetError("decode");
  }
}

/** S3/R2 DeleteObjects accepts at most 1000 keys per request. */
const DELETE_BATCH = 1000;

/**
 * Deletes every stored brand asset for an org: confirmed logos, mark, favicon
 * and apple icon under `branding/<clerkOrgId>/`, and unconfirmed uploads under
 * `branding-pending/<clerkOrgId>/`.
 *
 * Best-effort: callers must never have a DB reset undone by storage trouble,
 * so this logs and returns instead of throwing. Each prefix is cleared
 * independently, so trouble with one does not skip the other.
 */
export async function deleteBrandAssets(clerkOrgId: string): Promise<void> {
  let prefixes: string[];
  try {
    prefixes = [brandingPrefix(clerkOrgId), pendingPrefix(clerkOrgId)];
  } catch {
    console.error("[branding] deleteBrandAssets: refusing unsafe org id");
    return;
  }

  for (const prefix of prefixes) {
    await deletePrefix(prefix, clerkOrgId);
  }
}

async function deletePrefix(prefix: string, clerkOrgId: string): Promise<void> {
  try {
    const client = getR2Client();
    let token: string | undefined;

    do {
      const page = await client.send(
        new ListObjectsV2Command({
          Bucket: R2_BUCKET_NAME,
          Prefix: prefix,
          ContinuationToken: token,
        }),
      );

      const keys = (page.Contents ?? [])
        .map((object) => object.Key)
        .filter((key): key is string => typeof key === "string" && key.startsWith(prefix));

      for (let i = 0; i < keys.length; i += DELETE_BATCH) {
        const batch = keys.slice(i, i + DELETE_BATCH);
        const result = await client.send(
          new DeleteObjectsCommand({
            Bucket: R2_BUCKET_NAME,
            Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
          }),
        );
        if (result?.Errors?.length) {
          console.error(
            `[branding] deleteBrandAssets: ${result.Errors.length} object(s) not deleted under ${prefix}`,
            result.Errors.slice(0, 5),
          );
        }
      }

      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  } catch (error) {
    console.error(
      `[branding] deleteBrandAssets failed for ${clerkOrgId} (${prefix})`,
      r2ErrorSummary(error),
    );
  }
}
