import type { ClubPriceView } from "@/lib/services/club-pricing.service";
import { centsToDollars } from "@/lib/utils/money";

/**
 * Edit-form value for one club price. When the current price can't be shown
 * as a USD monthly amount the field starts empty with a note, and the form
 * then treats empty as "keep" (see ClubPriceNotes), so a Stripe outage can't
 * remove coaching.
 */
export function priceFormField(view: ClubPriceView): { amount: string; note?: string } {
  if (view.status === "none") return { amount: "" };
  if (view.status === "unavailable") {
    return {
      amount: "",
      note: "Couldn't load the current price from Stripe. Leave empty to keep it unchanged, or enter a new amount.",
    };
  }
  if (view.status === "unsupported") {
    return { amount: "", note: "Current Stripe price isn't a simple monthly amount — enter one to replace it." };
  }
  if (!view.usdMonthly) {
    return {
      amount: "",
      note: `Current price is ${view.label}. Leave empty to keep it, or enter a USD monthly amount to replace it.`,
    };
  }
  return { amount: centsToDollars(view.amountCents) };
}

/** List/detail text: "$14.99/mo", "—" for none. */
export function priceSummary(view: ClubPriceView): string {
  if (view.status === "none") return "—";
  if (view.status === "unavailable") return "Unavailable";
  if (view.status === "unsupported") return "Custom";
  return view.label;
}
