// Shared tier data consumed by every pricing-grid layout variant.
// Keep adjacent to pricing/index.tsx so layout exploration variants can render
// the same source of truth in different shapes (cards, table, hybrid, etc.).

export type TierId = "free" | "hobby" | "pro" | "enterprise";

export interface Tier {
  id: TierId;
  name: string;
  price: string;
  priceSuffix?: string;
  blurb: string;
  ctaLabel: string;
  ctaHref: string;
}

export const TIERS: Tier[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    priceSuffix: "/ month",
    blurb: "For solo developers exploring Laminar.",
    ctaLabel: "Get Started",
    ctaHref: "/projects",
  },
  {
    id: "hobby",
    name: "Hobby",
    price: "$30",
    priceSuffix: "/ month",
    blurb: "For small teams shipping their first production agent.",
    ctaLabel: "Get Started",
    ctaHref: "/projects",
  },
  {
    id: "pro",
    name: "Pro",
    price: "$150",
    priceSuffix: "/ month",
    blurb: "For teams running production agents at scale.",
    ctaLabel: "Get Started",
    ctaHref: "/projects",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    blurb: "For organizations with custom limits and compliance needs.",
    ctaLabel: "Contact us",
    ctaHref: "mailto:founders@lmnr.ai?subject=Enterprise%20Inquiry",
  },
];

export const RECOMMENDED_TIER: TierId = "pro";

// FeatureRow values per tier. A `string` renders as text in table cells, `true`
// renders as a checkmark, `false` / `null` renders as an em-dash.
export type FeatureValue = string | boolean | null;

export interface FeatureRow {
  label: string;
  subfeature?: string;
  values: Record<TierId, FeatureValue>;
}

// Flat feature list (no section headers). Order: Pricing rows, then Included,
// Workspace, Support. "Monthly price" is omitted because it's already shown in
// the per-tier header.
export const FEATURES: FeatureRow[] = [
  {
    label: "Data overage",
    values: { free: "—", hobby: "$2 / GB", pro: "$1.50 / GB", enterprise: "Custom" },
  },
  {
    label: "Signals step overage",
    values: { free: "—", hobby: "$0.0075 / step", pro: "$0.005 / step", enterprise: "Custom" },
  },
  {
    label: "Data",
    values: { free: "1 GB", hobby: "3 GB", pro: "10 GB", enterprise: "Custom" },
  },
  {
    label: "Signals steps processing",
    values: { free: "1,000", hobby: "5,000", pro: "50,000", enterprise: "Custom" },
  },
  {
    label: "Retention",
    values: { free: "15 days", hobby: "30 days", pro: "90 days", enterprise: "Custom" },
  },
  {
    label: "Projects",
    values: { free: "1", hobby: "Unlimited", pro: "Unlimited", enterprise: "Unlimited" },
  },
  {
    label: "Seats",
    values: { free: "1", hobby: "Unlimited", pro: "Unlimited", enterprise: "Unlimited" },
  },
  {
    label: "On-premise deployment",
    values: { free: false, hobby: false, pro: false, enterprise: true },
  },
  {
    label: "Support channel",
    values: { free: "Community", hobby: "Email", pro: "Slack", enterprise: "Dedicated" },
  },
];

// Flat features for card layouts (one bullet per row, original copy).
export interface CardFeature {
  label: string;
  subfeature?: string;
}

export const CARD_FEATURES: Record<TierId, CardFeature[]> = {
  free: [
    { label: "1 GB data", subfeature: "no overage" },
    { label: "1,000 Signals steps processing", subfeature: "no overage" },
    { label: "15 day retention" },
    { label: "1 project" },
    { label: "1 seat" },
    { label: "Community support" },
  ],
  hobby: [
    { label: "3 GB data included", subfeature: "then $2 / GB" },
    { label: "5,000 Signals steps processing included", subfeature: "then $0.0075 / Signals step" },
    { label: "30 day retention" },
    { label: "Unlimited projects" },
    { label: "Unlimited seats" },
    { label: "Email support" },
  ],
  pro: [
    { label: "10 GB data included", subfeature: "then $1.50 / GB" },
    { label: "50,000 Signals steps processing included", subfeature: "then $0.005 / Signals step" },
    { label: "90 day retention" },
    { label: "Unlimited projects" },
    { label: "Unlimited seats" },
    { label: "Slack support" },
  ],
  enterprise: [
    { label: "Custom limits" },
    { label: "On-premise" },
    { label: "Unlimited projects" },
    { label: "Unlimited seats" },
    { label: "Dedicated support" },
  ],
};
