import { type ItemDescription } from "@/lib/actions/checkout/types";

const DEFAULT_CURRENCY = "USD";

// Stripe zero-decimal currencies are billed in their major units directly
// (no minor subdivisions), so Stripe's `amount` field already represents the
// full amount and must NOT be divided by 100.
// https://docs.stripe.com/currencies#zero-decimal
const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

const formatMoney = (amount: number, currency: string): string => {
  const code = (currency || DEFAULT_CURRENCY).toUpperCase();
  const divisor = ZERO_DECIMAL_CURRENCIES.has(code) ? 1 : 100;
  const majorUnits = amount / divisor;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
    }).format(majorUnits);
  } catch {
    const sign = majorUnits < 0 ? "-" : "";
    const fractionDigits = divisor === 1 ? 0 : 2;
    return `${sign}${code} ${Math.abs(majorUnits).toFixed(fractionDigits)}`;
  }
};

/**
 * Human-readable quantity suffix for usage-billed items, e.g. `× 12` or
 * `× 3,450`. Subscription lines typically have quantity=1 which we omit to
 * avoid cluttering the email.
 */
export const formatItemQuantity = (item: ItemDescription): string => {
  const { quantity } = item;
  if (quantity == null || quantity <= 1) return "";
  return `× ${quantity.toLocaleString("en-US")}`;
};

export const formatItemAmount = (item: ItemDescription): string => {
  if (item.amount == null) return "";
  return formatMoney(item.amount, item.currency ?? DEFAULT_CURRENCY);
};

/**
 * Sum line amounts when every item has an amount and they share a currency.
 * Returns `null` when totals cannot be computed confidently (missing data or
 * mixed currencies), so the email omits the total instead of misreporting.
 */
export const itemTotalLine = (items: ItemDescription[]): string | null => {
  if (items.length === 0) return null;
  const first = items[0];
  if (first.amount == null) return null;
  const currency = (first.currency ?? DEFAULT_CURRENCY).toLowerCase();
  let sum = 0;
  for (const item of items) {
    if (item.amount == null) return null;
    if ((item.currency ?? DEFAULT_CURRENCY).toLowerCase() !== currency) return null;
    sum += item.amount;
  }
  return formatMoney(sum, currency);
};
