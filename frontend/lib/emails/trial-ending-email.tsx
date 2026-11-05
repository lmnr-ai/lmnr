import { Link, Text } from "@react-email/components";
import type { CSSProperties } from "react";

import { TIERS } from "@/lib/billing/tiers";

import TrialEmailLayout, {
  action,
  ChangesList,
  footnote,
  footnoteLink,
  intro,
  muted,
  paragraph,
  PRICING_URL,
  STARTER_TO_FREE_CHANGES,
  text,
} from "./trial-email-layout";

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
    <TrialEmailLayout
      workspaceName={workspaceName}
      heading="Your Starter trial ends soon"
      preview={`Your Starter trial for ${workspaceName} ends on ${endsOn}`}
    >
      <Text style={intro}>
        Your Starter trial for {workspaceName} ends on {endsOn}.
      </Text>
      <Text style={paragraph}>After that, it moves to the Free plan. Here{"'"}s what changes:</Text>
      <ChangesList changes={STARTER_TO_FREE_CHANGES} />
      <Text style={paragraph}>Should you keep Starter?</Text>
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
    </TrialEmailLayout>
  );
}

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
