import { retentionLabel, TIER_RETENTION } from "@/lib/billing/retention";
import {
  formatDataIncluded,
  formatDataOverage,
  formatPrice,
  formatProjects,
  formatSeats,
  formatSignalsCount,
  formatSignalsOverage,
  formatSignalsOverageShort,
  formatSupport,
  type Tier,
  TIERS,
} from "@/lib/billing/tiers";

type TierId = Tier;

// Landing-pricing-page-specific column metadata: render order + blurb + CTA.
// Numeric data + tier name/price come from `@/lib/billing/tiers`.
interface PricingColumnConfig {
  id: TierId;
  priceSuffix?: string;
  blurb: string;
  ctaLabel: string;
  ctaHref: string;
}

const PRICING_COLUMNS: PricingColumnConfig[] = [
  {
    id: "free",
    priceSuffix: "/ month",
    blurb: "For solo developers exploring Laminar.",
    ctaLabel: "Get Started",
    ctaHref: "/sign-up",
  },
  {
    id: "hobby",
    priceSuffix: "/ month",
    blurb: "For small teams shipping their first production agent.",
    ctaLabel: "Get Started",
    ctaHref: "/sign-up",
  },
  {
    id: "pro",
    priceSuffix: "/ month",
    blurb: "For teams running production agents at scale.",
    ctaLabel: "Get Started",
    ctaHref: "/sign-up",
  },
  {
    id: "enterprise",
    blurb: "For organizations with custom limits and compliance needs.",
    ctaLabel: "Contact us",
    ctaHref: "mailto:founders@lmnr.ai?subject=Enterprise%20Inquiry",
  },
];

// Hydrated column data consumed by pricing-table.tsx + cards-variant.tsx.
// `name` + `price` are derived from the central SoT — the landing page can
// never drift from workspace billing / onboarding.
export interface PricingColumn extends PricingColumnConfig {
  name: string;
  price: string;
}

export const TIER_COLUMNS: PricingColumn[] = PRICING_COLUMNS.map((c) => ({
  ...c,
  name: TIERS[c.id].name,
  price: formatPrice(c.id),
}));

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

// Helper to build a row whose value depends on the tier — saves repeating
// the four-key object literal for every usage-limits row.
const tierRow = (label: string, get: (tier: TierId) => FeatureValue): FeatureRow => ({
  label,
  values: {
    free: get("free"),
    hobby: get("hobby"),
    pro: get("pro"),
    enterprise: get("enterprise"),
  },
});

// FLAG: Tier-gating below is a best-guess. Security/compliance rows are
// assumed Enterprise-only; platform features assumed available across all
// tiers. Verify before shipping.
export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    title: "Usage limits",
    rows: [
      tierRow("Data included", formatDataIncluded),
      tierRow("Data overage rate", formatDataOverage),
      tierRow("Signals steps included", formatSignalsCount),
      // Comparison table is column-constrained, use the short "/ step" form
      // instead of the verbose "/ Signals step" the cards use.
      tierRow("Signals step overage rate", formatSignalsOverageShort),
      tierRow("Retention", (t) => (t === "enterprise" ? "Custom" : TIER_RETENTION[t].durationPlural)),
      tierRow("Projects", (t) => TIERS[t].projects),
      tierRow("Seats", (t) => TIERS[t].seats),
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
      { label: "SOC 2 Type II", values: { free: false, hobby: false, pro: true, enterprise: true } },
      { label: "HIPAA", values: { free: false, hobby: false, pro: true, enterprise: true } },
      { label: "Server-side PII Removal", values: { free: false, hobby: false, pro: true, enterprise: true } },
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

// Free uses "X GB data" (no overage); paid uses "X GB data included" + a
// "then $… / GB" subfeature. Wording differs per tier — keep it inline so
// the underlying numbers come from the SoT without splitting the per-tier
// phrasing across two files.
export const CARD_FEATURES: Record<TierId, CardFeature[]> = {
  free: [
    { label: `${formatDataIncluded("free")} data`, subfeature: "no overage" },
    { label: `${formatSignalsCount("free")} Signals steps`, subfeature: "no overage" },
    { label: retentionLabel("free") },
    { label: formatProjects("free") },
    { label: formatSeats("free") },
    { label: formatSupport("free") },
  ],
  hobby: [
    { label: `${formatDataIncluded("hobby")} data included`, subfeature: `then ${formatDataOverage("hobby")}` },
    { label: `${formatSignalsCount("hobby")} Signals steps`, subfeature: `then ${formatSignalsOverage("hobby")}` },
    { label: retentionLabel("hobby") },
    { label: formatProjects("hobby") },
    { label: formatSeats("hobby") },
    { label: formatSupport("hobby") },
  ],
  pro: [
    { label: `${formatDataIncluded("pro")} data included`, subfeature: `then ${formatDataOverage("pro")}` },
    { label: `${formatSignalsCount("pro")} Signals steps`, subfeature: `then ${formatSignalsOverage("pro")}` },
    { label: retentionLabel("pro") },
    { label: formatProjects("pro") },
    { label: formatSeats("pro") },
    { label: formatSupport("pro") },
  ],
  enterprise: [
    { label: "Custom limits" },
    { label: "On-premise" },
    { label: formatProjects("enterprise") },
    { label: formatSeats("enterprise") },
    { label: formatSupport("enterprise") },
  ],
};
