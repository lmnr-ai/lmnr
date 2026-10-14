import { Head, Html, Link, Preview, Section, Text } from "@react-email/components";
import type { CSSProperties } from "react";

import { TIER_RETENTION } from "@/lib/billing/retention";
import { TIERS } from "@/lib/billing/tiers";

const PRICING_URL = "https://lmnr.ai/pricing";

const CHANGES = [
  `Data retention: ${TIER_RETENTION.hobby.durationPlural} → ${TIER_RETENTION.free.durationPlural}`,
  `Included data: ${TIERS.hobby.includedBytesGB} GB → ${TIERS.free.includedBytesGB} GB a month`,
  "Signals pause",
  "Slack alerts pause",
  "Teammates lose access, owner keeps it",
];

const QUESTIONS = [
  "Does your team use this workspace?",
  `More than ${TIERS.free.includedBytesGB} GB of traces a month?`,
  "Need Signals or Slack alerts?",
];

export default function TrialEndingEmail({
  workspaceName,
  endsOn,
  addPaymentUrl,
}: {
  workspaceName: string;
  endsOn: string;
  addPaymentUrl: string;
}) {
  return (
    <Html lang="en">
      <Head>
        <style>{`@media screen and (max-width:720px) { .trial-page { padding:0 !important; } .trial-shell { width:100% !important; } .trial-card { border-radius:0 !important; } }`}</style>
      </Head>
      <Preview>{`Your Starter trial for ${workspaceName} ends on ${endsOn}`}</Preview>
      <div className="trial-page" style={page}>
        <div className="trial-shell" style={shell}>
          <Section className="trial-card" style={card}>
            <Text style={intro}>
              <strong>
                Your Starter trial for {workspaceName} ends on {endsOn}.
              </strong>
            </Text>
            <Text style={paragraph}>After that, it moves to the Free plan. Here{"'"}s what changes:</Text>
            <table role="presentation" cellPadding="0" cellSpacing="0" style={list}>
              <tbody>
                {CHANGES.map((change) => (
                  <tr key={change}>
                    <td style={bulletMarker}>●</td>
                    <td style={bulletText}>{change}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Text style={paragraph}>
              <strong>Should you keep Starter?</strong>
            </Text>
            <table role="presentation" cellPadding="0" cellSpacing="0" style={questions}>
              <tbody>
                <tr>
                  <td style={headerCell} />
                  <td style={headerCell}>Yes</td>
                  <td style={headerCell}>No</td>
                </tr>
                {QUESTIONS.map((question) => (
                  <tr key={question}>
                    <td style={{ ...cell, width: "56%" }}>{question}</td>
                    <td style={{ ...cell, fontWeight: 600 }}>Keep Starter</td>
                    <td style={{ ...cell, color: muted }}>Free is fine</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Link style={action} href={addPaymentUrl} target="_blank">
              Keep Starter features
            </Link>
            <Text style={footnote}>
              <Link href={PRICING_URL} style={footnoteLink} target="_blank">
                Compare plans
              </Link>
              {` · $${TIERS.hobby.basePriceMonthly} a month, cancel anytime`}
            </Text>
          </Section>
        </div>
      </div>
    </Html>
  );
}

const muted = "#6b6b6b";
const page: CSSProperties = { boxSizing: "border-box", margin: 0, padding: "20px", backgroundColor: "#ebebeb" };
const shell: CSSProperties = { width: "100%", maxWidth: "500px", margin: "0 auto" };
const card: CSSProperties = {
  boxSizing: "border-box",
  padding: "16px 20px 20px",
  borderRadius: "8px",
  backgroundColor: "#ffffff",
};
const text: CSSProperties = {
  margin: 0,
  color: "#0a0a0a",
  fontFamily: "'Inter', 'Roboto', 'Helvetica', sans-serif",
  fontSize: "14px",
  fontWeight: 400,
  letterSpacing: 0,
  lineHeight: "19px",
};
const intro: CSSProperties = { ...text, marginBottom: "16px" };
const paragraph: CSSProperties = { ...text, marginBottom: "12px" };
const list: CSSProperties = { width: "100%", borderCollapse: "collapse", marginBottom: "24px" };
const bulletMarker: CSSProperties = {
  width: "6px",
  padding: "0 8px 6px",
  color: "#fda476",
  fontSize: "10px",
  lineHeight: "19px",
  verticalAlign: "top",
};
const bulletText: CSSProperties = { ...text, paddingBottom: "6px", verticalAlign: "top" };
const questions: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  marginBottom: "40px",
  borderRadius: "8px",
  backgroundColor: "#f5f5f5",
};
const cell: CSSProperties = {
  ...text,
  padding: "8px 12px",
  fontSize: "13px",
  lineHeight: "18px",
  verticalAlign: "top",
};
const headerCell: CSSProperties = { ...cell, color: muted, fontWeight: 600 };
const action: CSSProperties = {
  display: "block",
  width: "fit-content",
  margin: "0 auto 16px",
  padding: "14px 24px",
  borderRadius: "500px",
  backgroundColor: "#fda476",
  color: "#0a0a0a",
  fontFamily: "'Inter', 'Roboto', 'Helvetica', sans-serif",
  fontSize: "14px",
  fontWeight: 500,
  letterSpacing: 0,
  lineHeight: "17px",
  textAlign: "center",
  textDecoration: "none",
};
const footnote: CSSProperties = { ...text, color: muted, fontSize: "13px", textAlign: "center" };
const footnoteLink: CSSProperties = { color: muted, textDecoration: "underline" };
