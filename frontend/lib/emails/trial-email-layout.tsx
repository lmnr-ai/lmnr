import { Head, Html, Img, Preview, Section, Text } from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";

import { TIER_RETENTION } from "@/lib/billing/retention";
import { TIERS } from "@/lib/billing/tiers";

import { LAMINAR_LOGO_CID } from "./report-email-layout";

export const PRICING_URL = "https://lmnr.ai/pricing";

// What a workspace loses moving from the Starter trial to Free.
export const STARTER_TO_FREE_CHANGES = [
  `Data access: ${TIER_RETENTION.hobby.durationPlural} → ${TIER_RETENTION.free.durationPlural}`,
  `Included data: ${TIERS.hobby.includedBytesGB} GB → ${TIERS.free.includedBytesGB} GB a month`,
  "Signals pause",
  "Slack alerts pause",
  "Teammates lose access, owner keeps it",
];

export default function TrialEmailLayout({
  workspaceName,
  heading,
  preview,
  children,
}: {
  workspaceName: string;
  heading: string;
  preview: string;
  children: ReactNode;
}) {
  return (
    <Html lang="en">
      <Head>
        <style>{`@media screen and (max-width:720px) { .trial-page { padding:0 !important; } .trial-shell { width:100% !important; } .trial-card, .trial-banner { border-radius:0 !important; } }`}</style>
      </Head>
      <Preview>{preview}</Preview>
      <div className="trial-page" style={page}>
        <div className="trial-shell" style={shell}>
          <table className="trial-banner" role="presentation" cellPadding="0" cellSpacing="0" style={bannerTable}>
            <tbody>
              <tr>
                <td style={banner}>
                  <table role="presentation" cellPadding="0" cellSpacing="0">
                    <tbody>
                      <tr>
                        <td style={{ lineHeight: 0 }}>
                          <Img src={`cid:${LAMINAR_LOGO_CID}`} alt="Laminar" width="76" height="13" style={logo} />
                        </td>
                        <td style={identity}>/</td>
                        <td style={identity}>{workspaceName}</td>
                      </tr>
                    </tbody>
                  </table>
                  <Text style={headingStyle}>{heading}</Text>
                </td>
              </tr>
            </tbody>
          </table>
          <Section className="trial-card" style={card}>
            {children}
          </Section>
        </div>
      </div>
    </Html>
  );
}

export const ChangesList = ({ changes }: { changes: string[] }) => (
  <table role="presentation" cellPadding="0" cellSpacing="0" style={list}>
    <tbody>
      {changes.map((change) => (
        <tr key={change}>
          <td style={bulletMarker}>●</td>
          <td style={bulletText}>{change}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

export const muted = "#6b6b6b";
const page: CSSProperties = { boxSizing: "border-box", margin: 0, padding: "20px", backgroundColor: "#ebebeb" };
const shell: CSSProperties = { width: "100%", maxWidth: "500px", margin: "0 auto" };
const bannerTable: CSSProperties = { width: "100%", marginBottom: "8px", borderRadius: "8px" };
const banner: CSSProperties = {
  boxSizing: "border-box",
  height: "160px",
  padding: "16px 20px 12px",
  borderRadius: "8px",
  backgroundColor: "#252526",
};
const logo: CSSProperties = { display: "block", width: "76px", height: "13px" };
const identity: CSSProperties = {
  paddingLeft: "8px",
  color: "#c3c4c8",
  fontFamily: "'Inter', 'Roboto', 'Helvetica', sans-serif",
  fontSize: "14px",
  fontWeight: 400,
  lineHeight: "15px",
  whiteSpace: "nowrap",
};
const headingStyle: CSSProperties = {
  margin: "77px 0 0",
  color: "#ffffff",
  fontFamily: "'General Sans', 'Inter', 'Roboto', 'Helvetica', sans-serif",
  fontSize: "28px",
  fontWeight: 500,
  letterSpacing: "-0.56px",
  lineHeight: "38px",
};
const card: CSSProperties = {
  boxSizing: "border-box",
  padding: "16px 20px 20px",
  borderRadius: "8px",
  backgroundColor: "#ffffff",
};
export const text: CSSProperties = {
  margin: 0,
  color: "#0a0a0a",
  fontFamily: "'Inter', 'Roboto', 'Helvetica', sans-serif",
  fontSize: "14px",
  fontWeight: 400,
  letterSpacing: 0,
  lineHeight: "19px",
};
export const intro: CSSProperties = { ...text, marginBottom: "16px" };
export const paragraph: CSSProperties = { ...text, marginBottom: "12px" };
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
export const action: CSSProperties = {
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
export const footnote: CSSProperties = { ...text, color: muted, fontSize: "13px", textAlign: "center" };
export const footnoteLink: CSSProperties = { color: muted, textDecoration: "underline" };
