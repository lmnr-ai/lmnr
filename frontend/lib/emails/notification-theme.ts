/** Design tokens for the app-server notification emails
 *  (`app-server/src/notifications/email.rs`). Defaults mirror the constants
 *  hardcoded in that file; the /email-notifications workspace tunes them live. */
export interface NotificationEmailTheme {
  fontFamily: string;
  primary: string;
  pageBackground: string;
  headerBackground: string;
  headerForeground: string;
  cardBackground: string;
  panelBackground: string;
  border: string;
  hairline: string;
  text: string;
  bodyText: string;
  mutedText: string;
  faintText: string;
  contentWidth: number;
  cardPadding: number;
  cardRadius: number;
  headerPaddingY: number;
  headerPaddingX: number;
  bodySize: number;
  bodyLineHeight: number;
  titleSize: number;
  titleWeight: number;
  eyebrowSize: number;
  metaSize: number;
  buttonRadius: number;
  buttonPaddingY: number;
  buttonPaddingX: number;
  buttonSize: number;
  severityInfo: string;
  severityWarning: string;
  severityCritical: string;
  // Signals Report redesign (Figma 4646:3638).
  reportHeaderBackground: string;
  reportHeaderText: string;
  reportHeaderIdentityOffsetY: number;
  reportSurface: string;
  reportRowBackground: string;
  /** Neutral events-over-time chart fill. hsl(0 0% 92%). */
  reportChartFill: string;
  reportBarOpacity: number;
  reportUp: string;
  reportDown: string;
  reportRowRadius: number;
  reportRowHeight: number;
  reportChartHeight: number;
  reportChartBuckets: number;
  reportMetricSize: number;
}

export const defaultNotificationTheme: NotificationEmailTheme = {
  fontFamily: `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif`,
  primary: "#D0754E",
  pageBackground: "#f3f4f6",
  headerBackground: "#0A0A0A",
  headerForeground: "#ffffff",
  cardBackground: "#ffffff",
  panelBackground: "#f9fafb",
  border: "#e5e7eb",
  hairline: "#f3f4f6",
  text: "#111827",
  bodyText: "#374151",
  mutedText: "#6b7280",
  faintText: "#9ca3af",
  contentWidth: 640,
  cardPadding: 24,
  cardRadius: 10,
  headerPaddingY: 28,
  headerPaddingX: 24,
  bodySize: 14,
  bodyLineHeight: 1.6,
  titleSize: 22,
  titleWeight: 700,
  eyebrowSize: 13,
  metaSize: 12,
  buttonRadius: 6,
  buttonPaddingY: 10,
  buttonPaddingX: 24,
  buttonSize: 14,
  severityInfo: "#10b981",
  severityWarning: "#f59e0b",
  severityCritical: "#ef4444",
  reportHeaderBackground: "#252526",
  reportHeaderText: "#c3c4c8",
  reportHeaderIdentityOffsetY: 2,
  reportSurface: "#ffffff",
  reportRowBackground: "#fafafa",
  reportChartFill: "#ebebeb",
  reportBarOpacity: 0.08,
  reportUp: "#cc3333",
  reportDown: "#16a34a",
  reportRowRadius: 100,
  reportRowHeight: 32,
  reportChartHeight: 96,
  reportChartBuckets: 14,
  reportMetricSize: 28,
};

/** Flatten `color` at `alpha` over an opaque `bg`. Outlook's Word engine drops
 *  rgba(), so the tint is precomputed to a solid hex — same math in Rust. */
export function blendHex(color: string, bg: string, alpha: number): string {
  const parse = (h: string) => {
    const v = h.replace("#", "");
    const n =
      v.length === 3
        ? v
            .split("")
            .map((c) => c + c)
            .join("")
        : v;
    return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
  };
  const [r1, g1, b1] = parse(color);
  const [r2, g2, b2] = parse(bg);
  const mix = (a: number, b: number) => Math.round(a * alpha + b * (1 - alpha));
  return "#" + [mix(r1, r2), mix(g1, g2), mix(b1, b2)].map((c) => c.toString(16).padStart(2, "0")).join("");
}

export const SEVERITY_LABELS = ["Info", "Warning", "Critical"] as const;

export function severityColor(t: NotificationEmailTheme, severity: number): string {
  return [t.severityInfo, t.severityWarning, t.severityCritical][severity] ?? t.faintText;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
