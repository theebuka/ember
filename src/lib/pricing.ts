import type { Currency } from "@/lib/api/types";
import { PRO_PRICE_USD, type Billing } from "@/lib/plan";

/**
 * Pro's price in the reader's own currency.
 *
 * **Converted, then rounded to a price a person would write.** $12 at today's
 * naira rate is ₦16,286.93, which reads as an exchange-rate readout rather than a
 * price; two significant figures gives ₦16,000, €11, £9.50, ¥1,800. The card says
 * it was converted, because until a checkout exists there is no local price list
 * behind it — only the dollar figure is a price ember has set.
 */
export function niceAmount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const magnitude = 10 ** (Math.floor(Math.log10(value)) - 1);
  const rounded = Math.round(value / magnitude) * magnitude;
  // Float noise from the power of ten (9.5000000001) would print as 9.50…01.
  return Number(rounded.toPrecision(2));
}

export interface Price {
  currency: Currency;
  /** What one month costs on this billing — the big number on the card. */
  perMonth: number;
  /** What is charged each time: the month, or the whole year. */
  charged: number;
  /** Converted from dollars rather than set in this currency. */
  converted: boolean;
}

/**
 * `rates` is USD per one unit of each currency, as `/api/fx` serves it. Falls
 * back to dollars whenever the rate is missing, rather than showing a number
 * computed from nothing.
 */
export function proPrice(
  billing: Billing,
  currency: Currency,
  rates: Partial<Record<Currency, number>> | undefined,
): Price {
  const usd = PRO_PRICE_USD[billing];
  const rate = rates?.[currency];
  if (currency === "USD" || !rate || rate <= 0) {
    return {
      currency: "USD",
      perMonth: billing === "yearly" ? usd / 12 : usd,
      charged: usd,
      converted: false,
    };
  }
  const charged = niceAmount(usd / rate);
  return {
    currency,
    perMonth: billing === "yearly" ? niceAmount(charged / 12) : charged,
    charged,
    converted: true,
  };
}
