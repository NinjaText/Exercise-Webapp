/**
 * Form <-> stored-value conversions for the admin plan editor. Browser-safe.
 * Money is integer cents and percentages are integer basis points so no float
 * ever reaches the ledger.
 */
import type { CommissionType } from "@prisma/client";
import { centsToDollars, parseDollarsToCents } from "@/lib/utils/money";
import { MAX_FIXED_CENTS, MAX_PERCENT_BP } from "./terms";

/** "20", "12.5", "7.25%" → basis points (2000, 1250, 725). Null when invalid or out of 0–100%. */
export function parsePercentToBp(input: string): number | null {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?\s*%?$/.exec(input.trim());
  if (!match) return null;
  const bp = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return bp <= MAX_PERCENT_BP ? bp : null;
}

export function bpToPercentInput(bp: number): string {
  return String(Number((bp / 100).toFixed(2)));
}

/** Parses a commission value typed for `type`. NONE always yields 0. */
export function parseCommissionValue(type: CommissionType, input: string): number | null {
  if (type === "NONE") return 0;
  if (type === "PERCENT") {
    const bp = parsePercentToBp(input);
    return bp !== null && bp > 0 ? bp : null;
  }
  const cents = parseDollarsToCents(input);
  return cents !== null && cents > 0 && cents <= MAX_FIXED_CENTS ? cents : null;
}

export function commissionValueInput(type: CommissionType, value: number): string {
  if (type === "PERCENT") return bpToPercentInput(value);
  if (type === "FIXED") return centsToDollars(value);
  return "";
}

/** Signed dollars for adjustments: "-25", "$40.50". */
export function parseSignedDollarsToCents(input: string): number | null {
  const trimmed = input.trim();
  const negative = trimmed.startsWith("-");
  const cents = parseDollarsToCents(negative ? trimmed.slice(1) : trimmed);
  if (cents === null || cents === 0 || cents > MAX_FIXED_CENTS) return null;
  return negative ? -cents : cents;
}
