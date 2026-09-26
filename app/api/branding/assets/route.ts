import { randomUUID } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/prisma";
import { R2_BUCKET_NAME, getR2Client } from "@/lib/r2";
import { r2ErrorSummary } from "@/lib/r2-errors";
import {
  ACCEPTED_MIME,
  AssetError,
  MAX_ASSET_BYTES,
  pendingDerivativeKey,
  pendingKey,
  processBrandAsset,
  type AssetErrorCode,
} from "@/lib/branding/assets";
import { assetKindSchema } from "@/lib/validators/branding";

/**
 * POST /api/branding/assets — stage a brand asset upload (spec §6.2).
 *
 * multipart/form-data: `kind` (logo-on-light | logo-on-dark | mark), `file`.
 * The image is decoder-verified and re-encoded to PNG with sharp, then put to
 * R2 under `branding-pending/<caller's clerkOrgId>/`. Nothing on the
 * Organization changes here; `confirmBrandAsset` promotes a pending key to
 * `branding/<org>/`. Unconfirmed uploads are expired by an R2 lifecycle rule
 * on the literal `branding-pending/` prefix (1 day).
 *
 * Body size: Next 16 has no Route Handler body limit of its own (the proxy
 * buffers up to `proxyClientMaxBodySize`, 10 MB by default) and Vercel caps
 * function request bodies at 4.5 MB — both comfortably above MAX_ASSET_BYTES.
 */

// sharp is a native Node module.
export const runtime = "nodejs";

const CACHE_CONTROL = "public, max-age=31536000, immutable";

/** Headroom over MAX_ASSET_BYTES for multipart framing in the Content-Length pre-check. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

const TOO_LARGE = "Images must be 2 MB or smaller.";

/** 415 for "not an image type we take", 422 for "an image we can't use". */
const STATUS_FOR_ASSET_ERROR: Record<AssetErrorCode, number> = {
  format: 415,
  animated: 415,
  dimensions: 422,
  decode: 422,
  size: 413,
};

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return fail(401, "Unauthorized");

  const dbUser = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { id: true, role: true, clerkOrgId: true },
  });
  if (!dbUser) return fail(401, "Unauthorized");
  if (dbUser.role !== "TRAINER" || !dbUser.clerkOrgId) return fail(403, "Forbidden");
  // The ONLY source of the org used in storage keys.
  const orgId = dbUser.clerkOrgId;

  // Refuse an obviously oversize body before buffering it. The allowance
  // covers multipart boundaries and the `kind` field; the per-file check
  // below is still the exact gate (and Content-Length may be absent).
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ASSET_BYTES + MULTIPART_OVERHEAD_BYTES) {
    return fail(413, TOO_LARGE);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "Send the image as multipart form data.");
  }

  const kind = assetKindSchema.safeParse(form.get("kind"));
  if (!kind.success) return fail(400, "Unknown brand asset slot.");

  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, "Choose an image to upload.");
  // Cheap checks on the declared size/type before reading any bytes. The
  // client's MIME type is untrusted — sharp's format check below is the gate.
  if (file.size === 0) return fail(400, "That file is empty.");
  if (file.size > MAX_ASSET_BYTES) return fail(413, TOO_LARGE);
  if (!(ACCEPTED_MIME as readonly string[]).includes(file.type)) {
    return fail(415, "Upload a PNG, JPEG or WebP image.");
  }

  let processed: Awaited<ReturnType<typeof processBrandAsset>>;
  try {
    processed = await processBrandAsset(Buffer.from(await file.arrayBuffer()), kind.data);
  } catch (error) {
    if (error instanceof AssetError) {
      // AssetError messages are our own copy, never sharp's.
      return fail(STATUS_FOR_ASSET_ERROR[error.code], error.message);
    }
    console.error("[branding] upload: unexpected processing error", {
      orgId,
      kind: kind.data,
      name: error instanceof Error ? error.name : typeof error,
    });
    return fail(500, "Something went wrong processing that image.");
  }

  // Build every key before touching R2, so a misconfiguration can't leave
  // objects behind.
  let objects: Array<{ key: string; body: Buffer }>;
  try {
    const uuid = randomUUID();
    objects = [
      { key: pendingKey(orgId, kind.data, uuid), body: processed.primary },
      ...processed.derivatives.map((d) => ({
        key: pendingDerivativeKey(orgId, d.suffix, uuid),
        body: d.buffer,
      })),
    ];
  } catch (error) {
    console.error("[branding] upload: could not build asset keys", {
      orgId,
      message: error instanceof Error ? error.message : String(error),
    });
    return fail(500, "Uploads are not configured right now.");
  }

  const client = getR2Client();
  const results = await Promise.allSettled(
    objects.map(({ key, body }) =>
      client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: key,
          Body: body,
          ContentType: "image/png",
          CacheControl: CACHE_CONTROL,
        }),
      ),
    ),
  );

  if (results.some((r) => r.status === "rejected")) {
    const firstError = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    console.error("[branding] upload: R2 put failed", {
      orgId,
      kind: kind.data,
      error: r2ErrorSummary(firstError.reason),
    });
    // Best-effort cleanup of whatever did land; the pending lifecycle rule
    // catches anything this misses.
    const landed = objects.filter((_, i) => results[i].status === "fulfilled");
    await Promise.allSettled(
      landed.map(({ key }) =>
        client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key })),
      ),
    );
    return fail(502, "Couldn't store that image. Please try again.");
  }

  const [primary, ...derivatives] = objects.map((o) => o.key);
  return NextResponse.json({ pendingKeys: { primary, derivatives } });
}
