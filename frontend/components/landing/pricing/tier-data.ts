type TierId = "free" | "hobby" | "pro" | "enterprise";

interface Tier {
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
    ctaHref: "/sign-up",
  },
  {
    id: "hobby",
    name: "Hobby",
    price: "$30",
    priceSuffix: "/ month",
    blurb: "For small teams shipping their first production agent.",
    ctaLabel: "Get Started",
    ctaHref: "/sign-up",
  },
  {
    id: "pro",
    name: "Pro",
    price: "$150",
    priceSuffix: "/ month",
    blurb: "For teams running production agents at scale.",
    ctaLabel: "Get Started",
    ctaHref: "/sign-up",
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

// `false` / `null` cells render as an em-dash via the table renderer.
export type FeatureValue = string | boolean | null;

interface FeatureRow {
  label: string;
  values: Record<TierId, FeatureValue>;
}

export interface FeatureGroup {
  title: string;
  rows: FeatureRow[];
}

// FLAG: Tier-gating below is a best-guess. Security/compliance rows are
// assumed Enterprise-only; platform features assumed available across all
// tiers. Verify before shipping.
export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    title: "Usage limits",
    rows: [
      { label: "Data included", values: { free: "1 GB", hobby: "3 GB", pro: "10 GB", enterprise: "Custom" } },
      {
        label: "Data overage rate",
        values: { free: "—", hobby: "$2 / GB", pro: "$1.50 / GB", enterprise: "Custom" },
      },
      {
        label: "Signals steps included",
        values: { free: "500", hobby: "5,000", pro: "50,000", enterprise: "Custom" },
      },
      {
        label: "Signals step overage rate",
        values: { free: "—", hobby: "$0.0075 / step", pro: "$0.005 / step", enterprise: "Custom" },
      },
      { label: "Retention", values: { free: "15 days", hobby: "30 days", pro: "90 days", enterprise: "Custom" } },
      { label: "Projects", values: { free: "1", hobby: "Unlimited", pro: "Unlimited", enterprise: "Unlimited" } },
      { label: "Seats", values: { free: "1", hobby: "Unlimited", pro: "Unlimited", enterprise: "Unlimited" } },
      {
        label: "Custom usage limits & alerts",
        values: { free: false, hobby: true, pro: true, enterprise: true },
      },
    ],
  },
  {
    title: "Platform",
    rows: [
      { label: "Trace ingestion (OTLP)", values: { free: true, hobby: true, pro: true, enterprise: true } },
      { label: "Full-text trace search", values: { free: true, hobby: true, pro: true, enterprise: true } },
      { label: "Custom dashboards", values: { free: true, hobby: true, pro: true, enterprise: true } },
      { label: "SQL editor", values: { free: true, hobby: true, pro: true, enterprise: true } },
      { label: "Signals", values: { free: true, hobby: true, pro: true, enterprise: true } },
      { label: "Signal event clusters", values: { free: false, hobby: false, pro: true, enterprise: true } },
      { label: "Evaluations", values: { free: true, hobby: true, pro: true, enterprise: true } },
      { label: "Datasets", values: { free: true, hobby: true, pro: true, enterprise: true } },
      { label: "Labeling queues", values: { free: true, hobby: true, pro: true, enterprise: true } },
      { label: "Browser session recording", values: { free: true, hobby: true, pro: true, enterprise: true } },
      { label: "Agent debugger", values: { free: true, hobby: true, pro: true, enterprise: true } },
      { label: "MCP access", values: { free: true, hobby: true, pro: true, enterprise: true } },
      { label: "Slack alerts", values: { free: true, hobby: true, pro: true, enterprise: true } },
      { label: "Email alerts", values: { free: true, hobby: true, pro: true, enterprise: true } },
    ],
  },
  {
    title: "Security & compliance",
    rows: [
      { label: "OAuth sign-in", values: { free: true, hobby: true, pro: true, enterprise: true } },
      { label: "SOC 2 Type II", values: { free: true, hobby: true, pro: true, enterprise: true } },
      { label: "HIPAA", values: { free: true, hobby: true, pro: true, enterprise: true } },
    ],
  },
  {
    title: "Support",
    rows: [
      // Cumulative — higher tiers retain access to all lower-tier support channels.
      { label: "Discord", values: { free: true, hobby: true, pro: true, enterprise: true } },
      { label: "Email support", values: { free: false, hobby: true, pro: true, enterprise: true } },
      { label: "Slack support", values: { free: false, hobby: false, pro: true, enterprise: true } },
      { label: "Dedicated support", values: { free: false, hobby: false, pro: false, enterprise: true } },
    ],
  },
];

interface CardFeature {
  label: string;
  subfeature?: string;
}

export const CARD_FEATURES: Record<TierId, CardFeature[]> = {
  free: [
    { label: "1 GB data", subfeature: "no overage" },
    { label: "500 Signals steps", subfeature: "no overage" },
    { label: "15 day retention" },
    { label: "1 project" },
    { label: "1 seat" },
    { label: "Community support" },
  ],
  hobby: [
    { label: "3 GB data included", subfeature: "then $2 / GB" },
    { label: "5,000 Signals steps", subfeature: "then $0.0075 / Signals step" },
    { label: "30 day retention" },
    { label: "Unlimited projects" },
    { label: "Unlimited seats" },
    { label: "Email support" },
  ],
  pro: [
    { label: "10 GB data included", subfeature: "then $1.50 / GB" },
    { label: "50,000 Signals steps", subfeature: "then $0.005 / Signals step" },
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
