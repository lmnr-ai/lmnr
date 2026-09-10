import { Head, Html, Img, Preview, Section, Text } from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";

import { defaultEmailTheme, type EmailTheme } from "../theme";
import { EmailTailwind } from "./email-tailwind";

export const LAMINAR_LOGO_CID = "laminar-logo";
const LOGO_URL = `cid:${LAMINAR_LOGO_CID}`;

interface ReportEmailLayoutProps {
  preview: string;
  workspace: string;
  title: string;
  children: ReactNode;
  theme?: EmailTheme;
}

export function ReportEmailLayout({
  preview,
  workspace,
  title,
  children,
  theme = defaultEmailTheme,
}: ReportEmailLayoutProps) {
  const page: CSSProperties = {
    margin: 0,
    backgroundColor: "#f3f4f6",
    fontFamily: theme.fontFamily,
    color: theme.foreground,
  };
  const shell: CSSProperties = { maxWidth: "544px", margin: "0 auto", padding: "24px 20px" };
  const banner: CSSProperties = {
    boxSizing: "border-box",
    height: "160px",
    padding: "16px 20px 12px",
    marginBottom: "4px",
    borderRadius: "8px",
    backgroundColor: "#252526",
  };
  const card: CSSProperties = {
    boxSizing: "border-box",
    padding: "20px",
    borderRadius: "10px",
    backgroundColor: theme.background,
  };

  return (
    <EmailTailwind>
      <Html lang="en">
        <Head>
          <style>{`@media screen and (max-width:720px) { .email-page { background:transparent !important; } .email-report-card { background:#fafafa !important; } .email-shell { padding-left:0 !important; padding-right:0 !important; } }`}</style>
        </Head>
        <Preview>{preview}</Preview>
        <div className="email-page" style={page}>
          <div className="email-shell" style={shell}>
            <Section style={banner}>
              <table cellPadding="0" cellSpacing="0" role="presentation">
                <tbody>
                  <tr style={{ height: "15px" }}>
                    <td style={{ width: "76px", height: "15px", verticalAlign: "middle", lineHeight: 0 }}>
                      <Img src={LOGO_URL} alt="Laminar" width="76" height="13" style={{ display: "block" }} />
                    </td>
                    <td style={{ width: "8px" }} />
                    <td style={{ ...identity, verticalAlign: "middle" }}>/</td>
                    <td style={{ width: "8px" }} />
                    <td style={{ ...identity, verticalAlign: "middle" }}>{workspace}</td>
                  </tr>
                </tbody>
              </table>
              <Text style={titleStyle}>{title}</Text>
            </Section>
            <Section style={card}>{children}</Section>
          </div>
        </div>
      </Html>
    </EmailTailwind>
  );
}

const identity: CSSProperties = {
  color: "#c3c4c8",
  fontSize: "14px",
  fontWeight: 400,
  letterSpacing: "-0.32px",
  lineHeight: "15px",
  transform: "translateY(2px)",
  whiteSpace: "nowrap",
};

const titleStyle: CSSProperties = {
  margin: "86px 0 0",
  color: "#ffffff",
  fontSize: "28px",
  fontWeight: 400,
  letterSpacing: "-0.56px",
  lineHeight: "34px",
};
