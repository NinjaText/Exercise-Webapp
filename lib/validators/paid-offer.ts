import { z } from "zod";
import {
  CANCELLATION_POLICIES,
  OFFER_KINDS,
  OFFER_MAX_PRICE_CENTS,
  OFFER_MIN_PRICE_CENTS,
} from "@/lib/payments/connect-config";

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");

const priceInCents = z
  .number()
  .int("Price must be a whole number of cents")
  .min(OFFER_MIN_PRICE_CENTS, "Price must be at least $1.00")
  .max(OFFER_MAX_PRICE_CENTS, "Price must be at most $10,000.00");

const name = z.string().trim().min(1, "Name is required").max(80, "Name must be 80 characters or fewer");

const description = z
  .string()
  .trim()
  .max(500, "Description must be 500 characters or fewer")
  .optional()
  .transform((v) => (v ? v : null));

/** Empty string from a "None" select option means "no program". */
const optionalProgramId = z
  .union([objectId, z.literal("")])
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const createOfferSchema = z
  .object({
    kind: z.enum(OFFER_KINDS),
    name,
    description,
    priceInCents,
    programTemplateId: optionalProgramId,
    cancellationPolicy: z.enum(CANCELLATION_POLICIES).default("END_OF_PERIOD"),
  })
  .refine((v) => v.kind !== "PROGRAM" || v.programTemplateId !== null, {
    message: "Choose the program this purchase unlocks",
    path: ["programTemplateId"],
  });

export type CreateOfferInput = z.infer<typeof createOfferSchema>;

/** The kind of an offer never changes (a one-time product can't become a subscription). */
export const updateOfferSchema = z.object({
  offerId: objectId,
  name,
  description,
  priceInCents,
  programTemplateId: optionalProgramId,
  cancellationPolicy: z.enum(CANCELLATION_POLICIES).default("END_OF_PERIOD"),
});

export type UpdateOfferInput = z.infer<typeof updateOfferSchema>;

export const offerIdSchema = objectId;
