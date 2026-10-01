"use server";

import { activeUserOnly } from "@/lib/auth/active-user";
import { createHash } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import type { Organization, User } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  MAX_ASSET_BYTES,
  assetUrl,
  derivativeKey,
  fieldForDerivative,
  fieldForKind,
  finalKey,
  ownAssetKey,
  validatePendingUpload,
  type AssetKind,
} from "@/lib/branding/asset-kinds";
import { deleteBrandAssets } from "@/lib/branding/assets";
import { deriveBrandTokens } from "@/lib/branding/tokens";
import { BrandColorError } from "@/lib/branding/types";
import { prisma } from "@/lib/prisma";
import { logAudit, diffFields, deriveActorType, AUDIT_ACTIONS } from "@/lib/services/audit-log.service";
import { expireBranding } from "@/lib/services/branding.service";
import { getOrganization } from "@/lib/services/organization.service";
import { R2_BUCKET_NAME, getR2Client } from "@/lib/r2";
import { isR2NotFound, r2ErrorSummary } from "@/lib/r2-errors";
import { assetKindSchema, brandingSettingsSchema } from "@/lib/validators/branding";

export type BrandingSettings = {
  brandingEnabled: boolean;
  brandDisplayName: string | null;
  brandPrimaryColor: string | null;
  orgName: string;
  /** Raw stored URLs (may be external legacy URLs); the settings UI decides how to display them. */
  assets: {
    logoOnLightUrl: string | null;
    logoOnDarkUrl: string | null;
    markUrl: string | null;
  };
};

type ActionError = { success: false; error: string; field?: string };

const SETTINGS_PATH = "/settings/branding";
type BrandingSnapshotKey = "brandingEnabled" | "brandDisplayName" | "brandPrimaryColor";
const AUDIT_DIFF_KEYS: BrandingSnapshotKey[] = ["brandingEnabled", "brandDisplayName", "brandPrimaryColor"];

/**
 * Resolves the caller from `auth()` → DB user and enforces "trainer with an
 * org". The org id always comes from the DB user, never from the client.
 */
async function requireTrainerOrg(): Promise<
  { ok: true; dbUser: User; clerkOrgId: string } | { ok: false; error: string }
> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Unauthorized" };

  const dbUser = activeUserOnly(await prisma.user.findUnique({ where: { clerkId: userId } }));
  if (!dbUser) return { ok: false, error: "Unauthorized" };
  if (dbUser.role !== "TRAINER") return { ok: false, error: "Forbidden" };
  if (!dbUser.clerkOrgId) return { ok: false, error: "Organization not set up" };

  return { ok: true, dbUser, clerkOrgId: dbUser.clerkOrgId };
}

function brandingSnapshot(org: Pick<Organization, BrandingSnapshotKey>) {
  return {
    brandingEnabled: org.brandingEnabled,
    brandDisplayName: org.brandDisplayName,
    brandPrimaryColor: org.brandPrimaryColor,
  };
}

export async function getBrandingSettings(): Promise<BrandingSettings | null> {
  const guard = await requireTrainerOrg();
  if (!guard.ok) return null;

  // A load failure returns null so the page shows its "couldn't load" state instead of error.tsx.
  let org: Organization;
  try {
    org = await getOrganization(guard.clerkOrgId);
  } catch (err) {
    console.error("Failed to load branding settings:", err);
    return null;
  }
  return {
    ...brandingSnapshot(org),
    orgName: org.name,
    assets: {
      logoOnLightUrl: org.brandLogoOnLightUrl,
      logoOnDarkUrl: org.brandLogoOnDarkUrl,
      markUrl: org.brandMarkUrl,
    },
  };
}

export async function saveBrandingSettings(
  input: unknown,
): Promise<{ success: true } | ActionError> {
  const guard = await requireTrainerOrg();
  if (!guard.ok) return { success: false, error: guard.error };
  const { dbUser, clerkOrgId } = guard;

  // Syntactic validation (shape, hex format, display-name rules).
  const parsed = brandingSettingsSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = typeof issue?.path[0] === "string" ? issue.path[0] : undefined;
    return {
      success: false,
      error: issue?.message ?? "Invalid branding settings",
      ...(field ? { field } : {}),
    };
  }
  const data = parsed.data;

  // Semantic validation: the lightness guardrail. Only a plain object crosses
  // the Server Action boundary, never the BrandColorError instance.
  if (data.brandPrimaryColor) {
    try {
      deriveBrandTokens(data.brandPrimaryColor);
    } catch (err) {
      if (err instanceof BrandColorError) {
        return { success: false, error: err.message, field: "brandPrimaryColor" };
      }
      console.error("Failed to derive brand tokens:", err);
      return { success: false, error: "Invalid brand color", field: "brandPrimaryColor" };
    }
  }

  try {
    // Lazy-create so an org predating the migration still works; the row also
    // serves as the audit "before" snapshot.
    const before = await getOrganization(clerkOrgId);

    const after = await prisma.organization.update({
      where: { clerkOrgId },
      data: {
        brandingEnabled: data.brandingEnabled,
        brandDisplayName: data.brandDisplayName,
        brandPrimaryColor: data.brandPrimaryColor,
        brandUpdatedAt: new Date(),
        brandUpdatedById: dbUser.id,
      },
    });

    expireBranding(clerkOrgId);

    await logAudit({
      actorId: dbUser.id,
      actorType: deriveActorType(dbUser),
      actorName: `${dbUser.firstName} ${dbUser.lastName}`,
      action: AUDIT_ACTIONS.BRANDING_UPDATED,
      targetType: "Organization",
      targetId: clerkOrgId,
      orgId: clerkOrgId,
      metadata: diffFields(brandingSnapshot(before), brandingSnapshot(after), AUDIT_DIFF_KEYS),
    });

    revalidatePath(SETTINGS_PATH);
    return { success: true };
  } catch (err) {
    console.error("Failed to save branding:", err);
    return { success: false, error: "Failed to save branding" };
  }
}

export async function resetBranding(): Promise<{ success: true } | { success: false; error: string }> {
  const guard = await requireTrainerOrg();
  if (!guard.ok) return { success: false, error: guard.error };
  const { dbUser, clerkOrgId } = guard;

  try {
    await getOrganization(clerkOrgId);

    await prisma.organization.update({
      where: { clerkOrgId },
      data: {
        brandingEnabled: false,
        brandDisplayName: null,
        brandPrimaryColor: null,
        brandLogoOnLightUrl: null,
        brandLogoOnDarkUrl: null,
        brandMarkUrl: null,
        brandFaviconUrl: null,
        brandAppleIconUrl: null,
        brandUpdatedAt: new Date(),
        brandUpdatedById: dbUser.id,
      },
    });
  } catch (err) {
    console.error("Failed to reset branding:", err);
    return { success: false, error: "Failed to reset branding" };
  }

  // Best-effort: the DB no longer references the assets, so a storage failure
  // only leaves orphaned objects behind.
  try {
    await deleteBrandAssets(clerkOrgId);
  } catch (err) {
    console.error("Failed to delete brand assets:", err);
  }

  expireBranding(clerkOrgId);

  await logAudit({
    actorId: dbUser.id,
    actorType: deriveActorType(dbUser),
    actorName: `${dbUser.firstName} ${dbUser.lastName}`,
    action: AUDIT_ACTIONS.BRANDING_RESET,
    targetType: "Organization",
    targetId: clerkOrgId,
    orgId: clerkOrgId,
  });

  revalidatePath(SETTINGS_PATH);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Brand assets (spec §6.2): confirm a staged upload, remove an asset
// ---------------------------------------------------------------------------

const ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";
/** Longest legitimate pending key is ~110 chars; this is a cheap DoS bound, the regex is the gate. */
const MAX_KEY_LENGTH = 256;

const confirmBrandAssetSchema = z
  .object({
    kind: assetKindSchema,
    pendingKey: z.string().max(MAX_KEY_LENGTH),
    derivativeKeys: z.array(z.string().max(MAX_KEY_LENGTH)).max(2).optional(),
  })
  .strict();

const removeBrandAssetSchema = z.object({ kind: assetKindSchema }).strict();

type AssetField =
  | (typeof fieldForKind)[AssetKind]
  | (typeof fieldForDerivative)[keyof typeof fieldForDerivative];

/** Organization columns owned by a kind: the kind's URL, plus favicon/apple for the mark. */
function fieldsForKind(kind: AssetKind): AssetField[] {
  return kind === "mark"
    ? [fieldForKind.mark, fieldForDerivative["favicon-32"], fieldForDerivative["apple-180"]]
    : [fieldForKind[kind]];
}

/** R2 keys of the org's own objects currently referenced by `fields` (legacy/external URLs skipped). */
function ownKeysFor(org: Organization, clerkOrgId: string, fields: AssetField[]): string[] {
  return fields
    .map((field) => ownAssetKey(clerkOrgId, org[field]))
    .filter((key): key is string => key !== null);
}

/** Best-effort deletes; logs only a safe summary, never throws. */
async function deleteObjectsBestEffort(keys: string[], context: string): Promise<void> {
  if (keys.length === 0) return;
  const client = getR2Client();
  const results = await Promise.allSettled(
    keys.map((Key) => client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key }))),
  );
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) {
    const first = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    console.error(`[branding] ${context}: ${failed} object delete(s) failed`, {
      error: r2ErrorSummary(first.reason),
    });
  }
}

/** `bucket/key`, URL-encoded per segment, as CopyObject's `CopySource` requires. */
function copySource(key: string): string {
  return [R2_BUCKET_NAME, ...key.split("/")].map(encodeURIComponent).join("/");
}

const SINGLE_PART_ETAG_RE = /^[0-9a-f]{32}$/;

class PendingObjectError extends Error {
  constructor(readonly reason: "missing" | "invalid" | "unavailable") {
    super(reason);
    this.name = "PendingObjectError";
  }
}

/** Only "object does not exist" means expired; anything else is a transient storage error. */
function pendingReadError(err: unknown, op: string): PendingObjectError {
  if (isR2NotFound(err)) return new PendingObjectError("missing");
  console.error(`[branding] confirm: pending ${op} failed`, { error: r2ErrorSummary(err) });
  return new PendingObjectError("unavailable");
}

const PENDING_ERROR_MESSAGES: Record<PendingObjectError["reason"], string> = {
  missing: "That upload has expired. Please upload the image again.",
  invalid: "That upload is not a valid brand image. Please upload it again.",
  unavailable: "Couldn't verify the upload. Please try again.",
};

/** Every Organization column that can reference a brand object. */
const ALL_ASSET_FIELDS: AssetField[] = [
  fieldForKind["logo-on-light"],
  fieldForKind["logo-on-dark"],
  fieldForKind.mark,
  fieldForDerivative["favicon-32"],
  fieldForDerivative["apple-180"],
];

/**
 * Best-effort deletes `candidates`, minus any key the record references
 * *right now* in any brand field. The fresh read closes the window between an
 * earlier snapshot and the delete; if it fails, nothing is deleted (orphans
 * are harmless, a dangling URL is not).
 */
async function deleteUnreferencedBestEffort(
  clerkOrgId: string,
  candidates: string[],
  context: string,
): Promise<void> {
  if (candidates.length === 0) return;
  let referenced: Set<string>;
  try {
    const current = await prisma.organization.findUnique({
      where: { clerkOrgId },
      select: Object.fromEntries(ALL_ASSET_FIELDS.map((f) => [f, true])) as Record<AssetField, true>,
    });
    if (!current) throw new Error("organization not found");
    referenced = new Set(
      ALL_ASSET_FIELDS.map((f) => ownAssetKey(clerkOrgId, current[f])).filter(
        (key): key is string => key !== null,
      ),
    );
  } catch (err) {
    console.error(`[branding] ${context}: skipped cleanup, could not re-read the organization`, {
      name: err instanceof Error ? err.name : typeof err,
    });
    return;
  }
  await deleteObjectsBestEffort(
    candidates.filter((key) => !referenced.has(key)),
    context,
  );
}

/**
 * HEADs a pending object, enforces size/type, and returns the first 8 hex of
 * its content hash: the ETag (single-part PutObject → MD5 of the bytes), or a
 * sha256 of the body when the ETag isn't a plain MD5 (multipart).
 */
async function inspectPendingObject(key: string): Promise<string> {
  const client = getR2Client();
  let head;
  try {
    head = await client.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
  } catch (err) {
    throw pendingReadError(err, "head");
  }

  const length = head.ContentLength;
  if (typeof length !== "number" || length <= 0 || length > MAX_ASSET_BYTES) {
    throw new PendingObjectError("invalid");
  }
  if (head.ContentType !== "image/png") throw new PendingObjectError("invalid");

  const etag = (head.ETag ?? "").replace(/"/g, "").toLowerCase();
  if (SINGLE_PART_ETAG_RE.test(etag)) return etag.slice(0, 8);

  let bytes: Uint8Array | undefined;
  try {
    const object = await client.send(new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
    bytes = await object.Body?.transformToByteArray();
  } catch (err) {
    throw pendingReadError(err, "get");
  }
  if (!bytes || bytes.byteLength === 0 || bytes.byteLength > MAX_ASSET_BYTES) {
    throw new PendingObjectError("invalid");
  }
  return createHash("sha256").update(bytes).digest("hex").slice(0, 8);
}

/**
 * Promotes a staged upload (from `POST /api/branding/assets`) to its final,
 * content-addressed key and records the URL on the caller's org.
 *
 * Order (never point the DB at a missing object; never delete the only copy
 * before the DB points elsewhere):
 *   validate (no R2 calls) → Head → Copy → DB update → delete pending
 *   → delete previous finals for the kind → expire → audit → revalidate.
 */
export async function confirmBrandAsset(
  input: unknown,
): Promise<{ success: true; url: string } | { success: false; error: string }> {
  const guard = await requireTrainerOrg();
  if (!guard.ok) return { success: false, error: guard.error };
  const { dbUser, clerkOrgId } = guard;

  const parsed = confirmBrandAssetSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid upload" };
  const { kind } = parsed.data;

  // Org-scoped, anchored, same-UUID, exact derivative set — before any R2 call.
  const upload = validatePendingUpload(
    clerkOrgId,
    kind,
    parsed.data.pendingKey,
    parsed.data.derivativeKeys,
  );
  if (!upload) return { success: false, error: "Invalid upload" };

  const staged: Array<{ pending: string; field: AssetField; final: (sha8: string) => string }> = [
    { pending: upload.primary, field: fieldForKind[kind], final: (sha8) => finalKey(clerkOrgId, kind, sha8) },
    ...upload.derivatives.map(({ suffix, key }) => ({
      pending: key,
      field: fieldForDerivative[suffix] as AssetField,
      final: (sha8: string) => derivativeKey(clerkOrgId, suffix, sha8),
    })),
  ];

  let before: Organization;
  try {
    before = await getOrganization(clerkOrgId);
  } catch (err) {
    console.error("Failed to load organization for brand asset confirm:", err);
    return { success: false, error: "Failed to save branding" };
  }

  // 1. Head every pending object.
  let objects: Array<{ pending: string; field: AssetField; key: string; url: string }>;
  try {
    const hashes = await Promise.all(staged.map((s) => inspectPendingObject(s.pending)));
    objects = staged.map((s, i) => {
      const key = s.final(hashes[i]);
      return { pending: s.pending, field: s.field, key, url: assetUrl(key) };
    });
  } catch (err) {
    if (err instanceof PendingObjectError) {
      return { success: false, error: PENDING_ERROR_MESSAGES[err.reason] };
    }
    console.error("[branding] confirm: could not build asset keys", {
      name: err instanceof Error ? err.name : typeof err,
    });
    return { success: false, error: "Uploads are not configured right now." };
  }

  // 2. Copy to the final keys. Nothing is written to the DB unless all land.
  // Failures below never delete the new finals: a concurrent confirm (double
  // submit, identical bytes) or an update that committed despite erroring may
  // already point the record at them. Orphans are swept by reset, and
  // content-addressed keys are reused by the next identical upload.
  const client = getR2Client();
  const copies = await Promise.allSettled(
    objects.map((o) =>
      client.send(
        new CopyObjectCommand({
          Bucket: R2_BUCKET_NAME,
          CopySource: copySource(o.pending),
          Key: o.key,
          MetadataDirective: "REPLACE",
          ContentType: "image/png",
          CacheControl: ASSET_CACHE_CONTROL,
        }),
      ),
    ),
  );
  if (copies.some((r) => r.status === "rejected")) {
    const first = copies.find((r) => r.status === "rejected") as PromiseRejectedResult;
    console.error("[branding] confirm: R2 copy failed", {
      orgId: clerkOrgId,
      kind,
      error: r2ErrorSummary(first.reason),
    });
    // Pending objects stay for a retry; the lifecycle rule expires them.
    console.warn("[branding] confirm: leaving possible orphan finals", {
      keys: objects.map((o) => o.key),
    });
    return { success: false, error: "Couldn't save that image. Please try again." };
  }

  // 3. Point the record at the finals.
  const data: Partial<Record<AssetField, string>> = {};
  for (const o of objects) data[o.field] = o.url;
  try {
    await prisma.organization.update({
      where: { clerkOrgId },
      data: { ...data, brandUpdatedAt: new Date(), brandUpdatedById: dbUser.id },
    });
  } catch (err) {
    console.error("Failed to save brand asset:", err);
    console.warn("[branding] confirm: leaving possible orphan finals", {
      keys: objects.map((o) => o.key),
    });
    return { success: false, error: "Failed to save branding" };
  }

  expireBranding(clerkOrgId);

  // 4. Best-effort cleanup: the pending copies, then the kind's previous own
  // finals — minus anything the record references after a fresh re-read.
  await deleteObjectsBestEffort(objects.map((o) => o.pending), "confirm pending cleanup");
  const current = new Set(objects.map((o) => o.key));
  await deleteUnreferencedBestEffort(
    clerkOrgId,
    ownKeysFor(before, clerkOrgId, fieldsForKind(kind)).filter((key) => !current.has(key)),
    "confirm previous cleanup",
  );

  await logAudit({
    actorId: dbUser.id,
    actorType: deriveActorType(dbUser),
    actorName: `${dbUser.firstName} ${dbUser.lastName}`,
    action: AUDIT_ACTIONS.BRANDING_UPDATED,
    targetType: "Organization",
    targetId: clerkOrgId,
    orgId: clerkOrgId,
    metadata: { assets: [kind] },
  });

  revalidatePath(SETTINGS_PATH);
  return { success: true, url: objects[0].url };
}

/** Clears a brand asset (the mark also clears favicon/apple icon) and best-effort deletes its objects. */
export async function removeBrandAsset(
  input: unknown,
): Promise<{ success: true } | { success: false; error: string }> {
  const guard = await requireTrainerOrg();
  if (!guard.ok) return { success: false, error: guard.error };
  const { dbUser, clerkOrgId } = guard;

  const parsed = removeBrandAssetSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Unknown brand asset slot" };
  const { kind } = parsed.data;
  const fields = fieldsForKind(kind);

  let oldKeys: string[];
  try {
    const before = await getOrganization(clerkOrgId);
    oldKeys = ownKeysFor(before, clerkOrgId, fields);

    const cleared: Partial<Record<AssetField, null>> = {};
    for (const field of fields) cleared[field] = null;
    await prisma.organization.update({
      where: { clerkOrgId },
      data: { ...cleared, brandUpdatedAt: new Date(), brandUpdatedById: dbUser.id },
    });
  } catch (err) {
    console.error("Failed to remove brand asset:", err);
    return { success: false, error: "Failed to remove brand asset" };
  }

  expireBranding(clerkOrgId);

  // The DB no longer references them, so a storage failure only orphans objects.
  await deleteUnreferencedBestEffort(clerkOrgId, oldKeys, "remove");

  await logAudit({
    actorId: dbUser.id,
    actorType: deriveActorType(dbUser),
    actorName: `${dbUser.firstName} ${dbUser.lastName}`,
    action: AUDIT_ACTIONS.BRANDING_UPDATED,
    targetType: "Organization",
    targetId: clerkOrgId,
    orgId: clerkOrgId,
    metadata: { assets: [kind], removed: true },
  });

  revalidatePath(SETTINGS_PATH);
  return { success: true };
}
