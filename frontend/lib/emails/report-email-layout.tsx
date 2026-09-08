import { Button, Head, Html, Img, Link, Preview, Section, Text } from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";

import { defaultEmailTheme, type EmailTheme } from "./theme";

const PRIMARY_200 = "#da875f";
const PRIMARY_300 = "#d57e57";
const SURFACE_50 = "#0d0d0d";
export const REPORT_LOGO_CID = "laminar-report-logo";
const LOGO_URL = `cid:${REPORT_LOGO_CID}`;

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
    <Html lang="en">
      <Head>
        <style>{`@media screen and (max-width:720px) { .email-page { background:#fff !important; } .email-shell { padding-left:0 !important; padding-right:0 !important; } }`}</style>
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

export function EmailParagraph({
  children,
  first = false,
  theme = defaultEmailTheme,
}: {
  children: ReactNode;
  first?: boolean;
  theme?: EmailTheme;
}) {
  return (
    <Text style={{ margin: `${first ? 0 : 16}px 0 0`, color: theme.foreground, fontSize: "14px", lineHeight: "22px" }}>
      {children}
    </Text>
  );
}

export function EmailRows({ rows, theme = defaultEmailTheme }: { rows: Array<[string, string]>; theme?: EmailTheme }) {
  return (
    <Section style={{ marginTop: "20px" }}>
      {rows.map(([label, value]) => (
        <table
          key={label}
          width="100%"
          cellPadding="0"
          cellSpacing="0"
          role="presentation"
          style={{ marginBottom: "4px", borderRadius: "4px", backgroundColor: "#fafafa" }}
        >
          <tbody>
            <tr>
              <td style={{ padding: "7px 10px", color: theme.mutedForeground, fontSize: "14px" }}>{label}</td>
              <td align="right" style={{ padding: "7px 10px", color: theme.foreground, fontSize: "14px" }}>
                {value}
              </td>
            </tr>
          </tbody>
        </table>
      ))}
    </Section>
  );
}

export function EmailAction({
  href,
  children,
  align = "center",
}: {
  href: string;
  children: ReactNode;
  align?: "left" | "center";
}) {
  return (
    <Section style={{ marginTop: "20px", textAlign: align }}>
      <Button
        href={href}
        style={{
          padding: "10px 16px",
          borderRadius: "4px",
          backgroundColor: PRIMARY_200,
          color: SURFACE_50,
          fontSize: "14px",
          fontWeight: 400,
          textDecoration: "none",
        }}
      >
        {children}
      </Button>
    </Section>
  );
}

export function EmailFooter({ children, theme = defaultEmailTheme }: { children: ReactNode; theme?: EmailTheme }) {
  return (
    <Text style={{ margin: "16px 0 0", color: theme.mutedForeground, fontSize: "12px", lineHeight: "18px" }}>
      {children}
    </Text>
  );
}

export function EmailDocLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} style={{ color: PRIMARY_300, textDecoration: "none" }}>
      {children}
    </Link>
  );
}
