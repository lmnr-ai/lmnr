import { type ItemDescription } from "@/lib/actions/checkout/types";

const DEFAULT_CURRENCY = "USD";

const formatMoney = (amountInMinorUnits: number, currency: string): string => {
  const code = (currency || DEFAULT_CURRENCY).toUpperCase();
  const majorUnits = amountInMinorUnits / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
    }).format(majorUnits);
  } catch {
    const sign = majorUnits < 0 ? "-" : "";
    return `${sign}${code} ${Math.abs(majorUnits).toFixed(2)}`;
  }
};

/**
 * Human-readable quantity suffix for usage-billed items, e.g. `× 12` or
 * `× 3,450 signal steps`. Subscription lines typically have quantity=1 which
 * we omit to avoid cluttering the email.
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
