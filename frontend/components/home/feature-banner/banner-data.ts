export interface FeatureItem {
  label: string;
  title: string;
  description: string;
  docsUrl: string;
  tryItUrl: string;
}

export const features: FeatureItem[] = [
  {
    label: "New in Laminar",
    title: "Revamped Signals for Automatic Insights",
    description:
      "Laminar proactively detects patterns in your traces and creates signals from them. Automatic event clustering gives you instant insights from your traces.",
    docsUrl: "https://docs.laminar.sh/signals/overview",
    tryItUrl: "signals",
  },
  {
    label: "New in Laminar",
    title: "Usage Limits & Billing Controls",
    description:
      "Set spending caps and usage limits for your projects. Get alerts before you hit thresholds and maintain full control over your observability costs.",
    docsUrl: "https://docs.laminar.sh/overview",
    tryItUrl: "settings",
  },
  {
    label: "New in Laminar",
    title: "Agent Search Across Traces",
    description:
      "Search through your agent traces with natural language queries. Quickly find specific conversations, errors, or patterns across all your trace data.",
    docsUrl: "https://docs.laminar.sh/traces/introduction",
    tryItUrl: "traces",
  },
  {
    label: "New in Laminar",
    title: "Slack Reports & Email Alerts",
    description:
      "Receive automated reports in Slack and alert emails when important events are detected. Stay informed without constantly checking the dashboard.",
    docsUrl: "https://docs.laminar.sh/overview",
    tryItUrl: "settings",
  },
  {
    label: "New in Laminar",
    title: "Per-Signal Sampling Configuration",
    description:
      "Fine-tune sampling rates for individual signals. Reduce noise on high-volume signals while keeping full fidelity on critical ones.",
    docsUrl: "https://docs.laminar.sh/signals/overview",
    tryItUrl: "signals",
  },
];
