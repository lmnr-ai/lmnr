// Design workspace for transactional + notification emails. Not linked from the app.
"use client";

import "dialkit/styles.css";
import { DialRoot, useDialKit } from "dialkit";
import { useMemo, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";

import { NOTIFICATION_TEMPLATES, renderNotificationEmail } from "@/lib/emails/notification-preview";
import { renderNotificationPrototype } from "@/lib/emails/notification-preview/prototype";
import { defaultNotificationTheme as n, type NotificationEmailTheme } from "@/lib/emails/notification-theme";
import PaymentFailedEmail from "@/lib/emails/payment-failed-email";
import SubscriptionUpdatedEmail from "@/lib/emails/subscription-updated-email";
import { buildEmailStyles, defaultEmailTheme as d, type EmailTheme, emailThemePresets } from "@/lib/emails/theme";
import WelcomeEmail from "@/lib/emails/welcome-email";
import WorkspaceInviteEmail from "@/lib/emails/workspace-invite";

import ResizableEmailFrame from "./resizable-email-frame";

const TRANSACTIONAL = ["welcome", "workspace-invite", "payment-received", "payment-failed"] as const;
const ALL_TEMPLATES = [...NOTIFICATION_TEMPLATES, ...TRANSACTIONAL];

type Slider = [number, number, number, number];

export default function EmailNotificationsPage() {
  const [prototype, setPrototype] = useState<"original" | "report-language">("original");
  const [selectedTemplate, setSelectedTemplate] = useState<(typeof ALL_TEMPLATES)[number]>("signals-report");
  const values = useDialKit(
    "Email",
    {
      template: { type: "select" as const, options: [...ALL_TEMPLATES] },
      appearance: { type: "select" as const, options: ["light", "dark"] },
      brand: {
        primary: { type: "color" as const, default: n.primary },
        headerBackground: { type: "color" as const, default: n.headerBackground },
        pageBackground: { type: "color" as const, default: n.pageBackground },
        cardBackground: { type: "color" as const, default: n.cardBackground },
        panelBackground: { type: "color" as const, default: n.panelBackground },
        border: { type: "color" as const, default: n.border },
      },
      text: {
        text: { type: "color" as const, default: n.text },
        bodyText: { type: "color" as const, default: n.bodyText },
        mutedText: { type: "color" as const, default: n.mutedText },
        faintText: { type: "color" as const, default: n.faintText },
      },
      layout: {
        contentWidth: [n.contentWidth, 360, 900, 10] as Slider,
        cardPadding: [n.cardPadding, 8, 56, 2] as Slider,
        cardRadius: [n.cardRadius, 0, 28, 1] as Slider,
        headerPaddingY: [n.headerPaddingY, 8, 64, 2] as Slider,
        headerPaddingX: [n.headerPaddingX, 8, 64, 2] as Slider,
      },
      type: {
        bodySize: [n.bodySize, 11, 20, 1] as Slider,
        bodyLineHeight: [n.bodyLineHeight, 1.1, 2.2, 0.05] as Slider,
        titleSize: [n.titleSize, 14, 44, 1] as Slider,
        titleWeight: [n.titleWeight, 400, 800, 100] as Slider,
        eyebrowSize: [n.eyebrowSize, 10, 18, 1] as Slider,
        metaSize: [n.metaSize, 9, 16, 1] as Slider,
      },
      button: {
        _collapsed: true,
        buttonRadius: [n.buttonRadius, 0, 32, 1] as Slider,
        buttonPaddingY: [n.buttonPaddingY, 4, 28, 1] as Slider,
        buttonPaddingX: [n.buttonPaddingX, 8, 56, 1] as Slider,
        buttonSize: [n.buttonSize, 11, 20, 1] as Slider,
      },
      severity: {
        _collapsed: true,
        severityInfo: { type: "color" as const, default: n.severityInfo },
        severityWarning: { type: "color" as const, default: n.severityWarning },
        severityCritical: { type: "color" as const, default: n.severityCritical },
      },
      report: {
        reportHeaderBackground: { type: "color" as const, default: n.reportHeaderBackground },
        reportHeaderText: { type: "color" as const, default: n.reportHeaderText },
        reportHeaderIdentityOffsetY: [n.reportHeaderIdentityOffsetY, -12, 12, 1] as Slider,
        reportRowBackground: { type: "color" as const, default: n.reportRowBackground },
        reportChartFill: { type: "color" as const, default: n.reportChartFill },
        reportUp: { type: "color" as const, default: n.reportUp },
        reportDown: { type: "color" as const, default: n.reportDown },
        reportBarOpacity: [n.reportBarOpacity, 0, 0.4, 0.01] as Slider,
        reportRowRadius: [n.reportRowRadius, 0, 100, 1] as Slider,
        reportChartHeight: [n.reportChartHeight, 40, 240, 4] as Slider,
        reportMetricSize: [n.reportMetricSize, 16, 48, 1] as Slider,
      },
    },
    { id: "email-notifications", persist: true }
  );

  const dark = values.appearance === "dark";

  const notificationTheme: NotificationEmailTheme = useMemo(() => {
    const tuned: NotificationEmailTheme = {
      ...n,
      ...values.brand,
      ...values.text,
      ...values.layout,
      ...values.type,
      ...values.button,
      ...values.severity,
      ...values.report,
    };
    if (!dark) return tuned;

    // Keep the report banner fixed; only the surrounding email surfaces flip.
    return {
      ...tuned,
      pageBackground: "#0b0b0c",
      cardBackground: "#161618",
      panelBackground: "#1e1e21",
      reportSurface: "#161618",
      reportRowBackground: "#202024",
      reportChartFill: "#35353a",
      border: "#2a2a2e",
      hairline: "#232326",
      text: "#ededee",
      bodyText: "#c9c9cc",
      mutedText: "#9ca3af",
      faintText: "#71717a",
    };
  }, [dark, values.brand, values.text, values.layout, values.type, values.button, values.severity, values.report]);

  const transactionalTheme: EmailTheme = useMemo(
    () => ({
      ...d,
      ...emailThemePresets[dark ? "dark" : "light"],
      accent: notificationTheme.primary,
      foreground: notificationTheme.text,
      mutedForeground: notificationTheme.mutedText,
      background: notificationTheme.cardBackground,
      fontSize: notificationTheme.bodySize,
      headingSize: notificationTheme.titleSize,
      headingWeight: notificationTheme.titleWeight,
      buttonRadius: notificationTheme.buttonRadius,
      buttonPaddingY: notificationTheme.buttonPaddingY,
      buttonPaddingX: notificationTheme.buttonPaddingX,
    }),
    [dark, notificationTheme]
  );

  const html = useMemo(() => {
    const template = selectedTemplate;

    if (prototype === "report-language" && template !== "signals-report" && template !== "welcome") {
      return renderNotificationPrototype(notificationTheme, template);
    }

    if ((NOTIFICATION_TEMPLATES as readonly string[]).includes(template)) {
      return renderNotificationEmail(template as (typeof NOTIFICATION_TEMPLATES)[number], notificationTheme);
    }

    const theme = transactionalTheme;
    let email: React.ReactElement;
    switch (template) {
      case "workspace-invite":
        email = WorkspaceInviteEmail({ workspaceName: "Acme AI", inviteLink: "https://lmnr.ai/invite", theme });
        break;
      case "payment-received":
        email = SubscriptionUpdatedEmail({
          total: "$249.00",
          date: "March 4, 2026",
          billedTo: "billing@acme.ai",
          billingPortalUrl: "https://lmnr.ai/checkout/portal",
          theme,
        });
        break;
      case "payment-failed":
        email = PaymentFailedEmail({
          total: "$249.00",
          date: "March 4, 2026",
          billedTo: "billing@acme.ai",
          billingPortalUrl: "https://lmnr.ai/checkout/portal",
          theme,
        });
        break;
      default:
        email = WelcomeEmail({ theme });
    }

    const bg = buildEmailStyles(theme).body.backgroundColor;
    return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:${bg};}</style></head><body>${renderToStaticMarkup(email)}</body></html>`;
  }, [selectedTemplate, prototype, notificationTheme, transactionalTheme]);

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-6 p-10 transition-colors"
      style={{ backgroundColor: dark ? "#0b0b0c" : "#e8e8ea" }}
    >
      <div className="fixed top-4 left-1/2 z-50 flex max-w-[calc(100vw-32px)] -translate-x-1/2 flex-col items-center gap-2 rounded-2xl border border-black/10 bg-white/95 p-2 shadow-lg backdrop-blur dark:border-white/10 dark:bg-zinc-900/95">
        <div className="flex gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800">
          {(["original", "report-language"] as const).map((version) => (
            <button
              key={version}
              onClick={() => setPrototype(version)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${prototype === version ? "bg-white text-black shadow-sm dark:bg-zinc-700 dark:text-white" : "text-zinc-500"}`}
            >
              {version === "original" ? "Original" : "Report language"}
            </button>
          ))}
        </div>
        <div className="flex max-w-full gap-1 overflow-x-auto">
          {ALL_TEMPLATES.map((template) => (
            <button
              key={template}
              onClick={() => setSelectedTemplate(template)}
              className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs ${selectedTemplate === template ? "bg-zinc-900 text-white dark:bg-white dark:text-black" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
            >
              {template}
            </button>
          ))}
        </div>
      </div>
      <div className="pt-24">
        <ResizableEmailFrame html={html} dark={dark} initialWidth={720} />
      </div>
      <DialRoot position="top-right" theme={dark ? "dark" : "light"} />
    </div>
  );
}
