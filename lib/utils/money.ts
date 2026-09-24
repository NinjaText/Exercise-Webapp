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
