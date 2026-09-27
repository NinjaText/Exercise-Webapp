import { z } from "zod";
import { ASSET_KINDS } from "@/lib/branding/asset-kinds";
import { normalizeHex } from "@/lib/branding/color";

/**
 * Accepts `#abc`/`#ABCDEF` (with surrounding whitespace), always outputs a
 * lower-case 6-digit hex string (e.g. `#1d4ed8`).
 */
export const hexColorSchema = z
  .string()
  .trim()
  .refine((v) => normalizeHex(v) !== null, "Enter a color like #1d4ed8")
  .transform((v) => normalizeHex(v)!);

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a display name")
  // Needs something visible: a name of only ZWJs (allowed below) and whitespace is blank.
  .regex(/[^\s\u200D]/u, "Enter a display name")
  .max(60, "Keep it to 60 characters or fewer")
  // Cc: control characters; Cf: format characters (bidi controls, zero-width
  // space, BOM). U+200D (zero-width joiner) is the one Cf allowed, so joined
  // emoji such as "🏋️‍♀️" pass. Variation selectors (U+FE0F) are Mn, not Cf.
  .regex(/^(?:[^\p{Cc}\p{Cf}]|\u200D)+$/u, "No control or formatting characters");

export const brandingSettingsSchema = z.object({
  brandingEnabled: z.boolean(),
  brandDisplayName: displayNameSchema.nullable(),
  brandPrimaryColor: hexColorSchema.nullable(),
});

export type BrandingSettingsInput = z.infer<typeof brandingSettingsSchema>;

/** Brand asset slot; the kind list lives in `lib/branding/asset-kinds.ts`. */
export const assetKindSchema = z.enum(ASSET_KINDS);
