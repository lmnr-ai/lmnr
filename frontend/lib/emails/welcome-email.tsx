import { Head, Html, Img, Link, Preview, Section, Text } from "@react-email/components";
import type { CSSProperties } from "react";

import { LAMINAR_LOGO_CID } from "./report-email-layout";

export const WELCOME_BANNER_CID = "welcome-banner-background";
const GET_STARTED_URL = "https://laminar.sh/docs/getting-started";

export default function WelcomeEmail() {
  return (
    <Html lang="en">
      <Head>
        <style>{`@media screen and (max-width:720px) { .welcome-page { padding:0 !important; } .welcome-shell { width:100% !important; } .welcome-card, .welcome-banner { border-radius:0 !important; } }`}</style>
      </Head>
      <Preview>Welcome to Laminar - observability purpose-built for AI agents</Preview>
      <div className="welcome-page" style={page}>
        <div className="welcome-shell" style={shell}>
          <table className="welcome-banner" role="presentation" cellPadding="0" cellSpacing="0" style={bannerTable}>
            <tbody>
              <tr>
                <td {...{ background: `cid:${WELCOME_BANNER_CID}` }} style={banner}>
                  <Img src={`cid:${LAMINAR_LOGO_CID}`} alt="Laminar" width="76" height="13" style={logo} />
                  <Text style={heading}>Welcome to Laminar!</Text>
                </td>
              </tr>
            </tbody>
          </table>
          <Section className="welcome-card" style={card}>
            <Text style={intro}>
              Hey there, it{"'"}s Robert from Laminar. Excited for you to try it out!
              <br />
              <br />
              Laminar is an open-source observability platform purpose-built for AI agents.
              <br />
              <br />
              Here{"'"}s what you can do with Laminar:
            </Text>
            <table role="presentation" cellPadding="0" cellSpacing="0" style={bulletList}>
              <tbody>
                <tr>
                  <td style={bulletMarker}>●</td>
                  <td style={bulletText}>
                    <Link style={link} href="https://laminar.sh/docs/tracing/introduction" target="_blank">
                      Trace your agents
                    </Link>
                    {" — capture every LLM call and tool invocation. Set up tracing for your agent with a "}
                    <Link style={link} href={GET_STARTED_URL} target="_blank">
                      single prompt
                    </Link>
                    .
                  </td>
                </tr>
                <tr>
                  <td style={bulletMarker}>●</td>
                  <td style={bulletText}>
                    <Link style={link} href="https://laminar.sh/docs/signals/introduction" target="_blank">
                      Signals
                    </Link>
                    {" — find deep issues across thousands of traces with our "}
                    <Link style={link} href="https://laminar.sh/blog/flow-1" target="_blank">
                      trace-analysis model
                    </Link>{" "}
                    optimized for intelligence and efficiency.
                  </td>
                </tr>
                <tr>
                  <td style={bulletMarker}>●</td>
                  <td style={bulletText}>
                    <Link style={link} href="https://laminar.sh/docs/platform/cli" target="_blank">
                      CLI
                    </Link>{" "}
                    and{" "}
                    <Link style={link} href="https://laminar.sh/docs/platform/mcp" target="_blank">
                      MCP
                    </Link>
                    {
                      " — give your coding agents full SQL access to Laminar so they can investigate traces, build evals, and verify fixes."
                    }
                  </td>
                </tr>
                <tr>
                  <td style={lastBulletMarker}>●</td>
                  <td style={lastBulletText}>
                    <Link style={link} href="https://laminar.sh/docs/evaluations/introduction" target="_blank">
                      Evals
                    </Link>
                    {" — run evals against datasets locally or in CI. Catch regressions before they ship."}
                  </td>
                </tr>
              </tbody>
            </table>
            <Link style={action} href={GET_STARTED_URL} target="_blank">
              Get started in one prompt
            </Link>
            <Text style={closing}>
              Laminar is fully open source. Don{"'"}t forget to star our{" "}
              <Link style={link} href="https://github.com/lmnr-ai/lmnr" target="_blank">
                repo on GitHub
              </Link>
              !
              <br />
              <br />
              Got questions or need help with setup? Just{" "}
              <Link style={link} href="https://cal.com/robert-lmnr/demo" target="_blank">
                grab a slot on my calendar
              </Link>
              .
              <br />
              <br />
              Happy building!
              <br />
              <br />
              Robert,
              <br />
              Co-founder & CEO @ Laminar
            </Text>
          </Section>
        </div>
      </div>
    </Html>
  );
}

const page: CSSProperties = { boxSizing: "border-box", margin: 0, padding: "20px", backgroundColor: "#ebebeb" };
const shell: CSSProperties = { width: "100%", maxWidth: "580px", margin: "0 auto" };
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
const heading: CSSProperties = {
  margin: "73px 0 0",
  color: "#ffffff",
  fontFamily: "'General Sans', 'Inter', 'Roboto', 'Helvetica', sans-serif",
  fontSize: "28px",
  fontWeight: 500,
  letterSpacing: "-0.56px",
  lineHeight: "38px",
};
const card: CSSProperties = {
  boxSizing: "border-box",
  padding: "16px 20px",
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
const intro: CSSProperties = { ...text, marginBottom: "28px" };
const link: CSSProperties = { color: "#0a0a0a", fontWeight: 600, textDecoration: "underline" };
const bulletList: CSSProperties = { width: "100%", borderCollapse: "collapse", marginBottom: "28px" };
const bulletMarker: CSSProperties = {
  width: "6px",
  padding: "0 8px 18px",
  color: "#fda476",
  fontSize: "10px",
  lineHeight: "19px",
  verticalAlign: "top",
};
const bulletText: CSSProperties = { ...text, paddingBottom: "18px", verticalAlign: "top" };
const lastBulletMarker: CSSProperties = { ...bulletMarker, paddingBottom: 0 };
const lastBulletText: CSSProperties = { ...bulletText, paddingBottom: 0 };
const action: CSSProperties = {
  display: "block",
  width: "fit-content",
  margin: "0 auto 28px",
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
const closing: CSSProperties = { ...text };
