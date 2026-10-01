/**
 * Formats a Stripe minor-unit amount, e.g. (4900, "usd") -> "$49.00".
 *
 * Stripe's minor unit isn't always cents: zero-decimal currencies (JPY) are
 * sent in whole units and three-decimal currencies (KWD) in thousandths.
 * Dividing by a hardcoded 100 silently understates/overstates those. Instead
 * we ask `Intl.NumberFormat` for the currency's own exponent via
 * `resolvedOptions().maximumFractionDigits` (2 for USD/EUR, 0 for JPY, 3 for
 * KWD) and divide by that.
 *
 * Never throws: an unrecognized currency code makes the `Intl.NumberFormat`
 * constructor throw a `RangeError`. This runs on a webhook path, where a
 * formatting failure must never turn a successfully-handled event into a
 * failed response — so we catch it and fall back to a plain numeric amount
 * with the uppercased code.
 */
export function formatStripeAmount(amountInMinorUnits: number, currency: string): string {
  const code = currency.toUpperCase();
  try {
    const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency: code });
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(amountInMinorUnits / 10 ** digits);
  } catch (err) {
    console.error(`[money] failed to format amount for currency "${currency}":`, err);
    return `${amountInMinorUnits} ${code}`;
  }
}

/**
 * Parses a USD dollar string ("14.99", "$14.9", "14") into integer cents
 * without float math (19.99 * 100 is 1998.9999…). Up to 2 decimals; returns
 * null for anything else. Range checks are the caller's.
 */
export function parseDollarsToCents(input: string): number | null {
  const match = /^\$?(\d{1,9})(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

/** Integer cents to a plain dollar string for form inputs, e.g. 1499 -> "14.99". */
export function centsToDollars(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}
