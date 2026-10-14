import { Head, Html, Link, Preview, Section, Text } from "@react-email/components";
import type { CSSProperties } from "react";

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
        <style>{`@media screen and (max-width:720px) { .invite-page { padding:0 !important; } .invite-shell { width:100% !important; } .invite-card { border-radius:0 !important; } }`}</style>
      </Head>
      <Preview>{`You've been invited to join ${workspaceName} on Laminar`}</Preview>
      <div className="invite-page" style={page}>
        <div className="invite-shell" style={shell}>
          <Section className="invite-card" style={card}>
            <Text style={intro}>
              <strong>You&apos;ve been invited to join {workspaceName} on Laminar!</strong>
            </Text>
            <Text style={expiration}>This invitation will expire in 7 days.</Text>
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
const expiration: CSSProperties = { ...text, marginBottom: "40px" };
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
