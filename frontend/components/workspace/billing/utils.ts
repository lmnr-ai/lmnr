export type TierKey = "free" | "hobby" | "pro" | "enterprise";

export interface TierInfo {
  name: string;
  price: string;
  priceSubtext: string;
  features: string[];
  subfeatures: (string | null)[];
}

export const TIERS: { key: TierKey; info: TierInfo }[] = [
  {
    key: "free",
    info: {
      name: "Free",
      price: "$0",
      priceSubtext: "/ mo",
      features: ["1 GB data", "100 signal runs", "15 day retention", "1 project / 1 seat", "Community support"],
      subfeatures: [null, null, null, null, null],
    },
  },
  {
    key: "hobby",
    info: {
      name: "Hobby",
      price: "$25",
      priceSubtext: "/ mo",
      features: ["3 GB data", "1,000 signal runs", "30 day retention", "Unlimited projects / seats", "Email support"],
      subfeatures: ["$2 / GB", "$0.02 / run", null, null, null],
    },
  },
  {
    key: "pro",
    info: {
      name: "Pro",
      price: "$150",
      priceSubtext: "/ mo",
      features: ["10 GB data", "10,000 signal runs", "90 day retention", "Unlimited projects / seats", "Slack support"],
      subfeatures: ["$1.50 / GB", "$0.015 / run", null, null, null],
    },
  },
  {
    key: "enterprise",
    info: {
      name: "Enterprise",
      price: "Custom",
      priceSubtext: "",
      features: ["Custom limits", "On-premise", "Unlimited projects / seats", "Dedicated support"],
      subfeatures: [null, null, null, null],
    },
  },
];

export function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

export function formatDate(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
