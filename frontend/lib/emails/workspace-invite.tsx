import { Head, Html, Img, Link, Preview, Section, Text } from "@react-email/components";
import type { CSSProperties } from "react";

import { LAMINAR_LOGO_CID } from "./report-email-layout";
import { WELCOME_BANNER_CID } from "./welcome-email";

export default function WorkspaceInviteEmail({
  workspaceName,
  inviteLink,
}: {
  workspaceName: string;
  inviteLink: string;
}) {
  return (
    <Html lang="en">
      <Head>
        <style>{`@media screen and (max-width:720px) { .invite-page { padding:0 !important; } .invite-shell { width:100% !important; } .invite-card, .invite-banner { border-radius:0 !important; } }`}</style>
      </Head>
      <Preview>{`You've been invited to join ${workspaceName} on Laminar`}</Preview>
      <div className="invite-page" style={page}>
        <div className="invite-shell" style={shell}>
          <table className="invite-banner" role="presentation" cellPadding="0" cellSpacing="0" style={bannerTable}>
            <tbody>
              <tr>
                <td {...{ background: `cid:${WELCOME_BANNER_CID}` }} style={banner}>
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
                  <Text style={heading}>Join {workspaceName} on Laminar!</Text>
                </td>
              </tr>
            </tbody>
          </table>
          <Section className="invite-card" style={card}>
            <Text style={intro}>
              You&apos;ve been invited to join {workspaceName} on Laminar! This invitation will expire in 7 days.
            </Text>
            <Link style={action} href={inviteLink} target="_blank">
              Accept invitation
            </Link>
            <Text style={closing}>
              If you have any questions, please visit our{" "}
              <Link href="https://docs.lmnr.ai" style={link} target="_blank">
                documentation
              </Link>{" "}
              or send us a message at{" "}
              <Link href="mailto:founders@lmnr.ai" style={link}>
                founders@lmnr.ai
              </Link>
              .
            </Text>
          </Section>
        </div>
      </div>
    </Html>
  );
}

const page: CSSProperties = { boxSizing: "border-box", margin: 0, padding: "20px", backgroundColor: "#ebebeb" };
const shell: CSSProperties = { width: "100%", maxWidth: "500px", margin: "0 auto" };
const bannerTable: CSSProperties = { width: "100%", marginBottom: "8px", borderRadius: "8px" };
const banner: CSSProperties = {
  boxSizing: "border-box",
  height: "160px",
  padding: "16px 20px 12px",
  borderRadius: "8px",
  backgroundColor: "#252526",
  backgroundImage: `url('cid:${WELCOME_BANNER_CID}')`,
  backgroundPosition: "center",
  backgroundSize: "cover",
  backgroundRepeat: "no-repeat",
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
const heading: CSSProperties = {
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
const text: CSSProperties = {
  margin: 0,
  color: "#0a0a0a",
  fontFamily: "'Inter', 'Roboto', 'Helvetica', sans-serif",
  fontSize: "14px",
  fontWeight: 400,
  letterSpacing: 0,
  lineHeight: "19px",
};
const intro: CSSProperties = { ...text, marginBottom: "40px" };
const action: CSSProperties = {
  display: "block",
  width: "fit-content",
  margin: "0 auto 40px",
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
const link: CSSProperties = { color: "#0a0a0a", fontWeight: 600, textDecoration: "underline" };
const closing: CSSProperties = { ...text };
