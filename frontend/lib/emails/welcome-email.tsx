import { Html, Link, Preview, Text } from "@react-email/components";

export default function WelcomeEmail() {
  return (
    <Html lang="en">
      <Preview>Welcome to Laminar - observability purpose-built for AI agents</Preview>
      <div style={container}>
        <Text style={heading}>Welcome to Laminar! 👋</Text>
        <Text style={text}>I{"'"}m Robert, CEO of Laminar. Stoked to have you join our community!</Text>
        <Text style={text}>
          Laminar is an open-source observability platform purpose-built for AI agents. Trace every LLM call, tool
          execution, and custom function, then use captured data to debug, analyze, and improve your agents at scale.
        </Text>
        <Text style={text}>Here{"'"}s what you can do:</Text>
        <div style={bulletList}>
          <Text style={bulletPoint}>
            •{" "}
            <Link style={link} href="https://lmnr.ai/docs/tracing/introduction" target="_blank">
              Trace your agents
            </Link>
            {
              " — capture every LLM call and tool invocation with first-class support for AI SDK, LangChain, Browser Use, and more."
            }
          </Text>
          <Text style={bulletPoint}>
            •{" "}
            <Link style={link} href="https://lmnr.ai/docs/signals" target="_blank">
              Signals
            </Link>
            {
              " — describe patterns, errors, and outcomes in natural language and track them across all your traces automatically."
            }
          </Text>
          <Text style={bulletPoint}>
            •{" "}
            <Link style={link} href="https://lmnr.ai/docs/platform/debugger" target="_blank">
              Debugger
            </Link>
            {
              " — rerun long-running agents from any checkpoint without leaving the browser. Tweak prompts, rerun, and inspect the new trace on the same page."
            }
          </Text>
          <Text style={bulletPoint}>
            •{" "}
            <Link style={link} href="https://lmnr.ai/docs/platform/sql-editor" target="_blank">
              SQL engine
            </Link>
            {
              " — query all your trace data, signals, and evaluations directly with SQL. Find patterns the dashboard doesn't anticipate."
            }
          </Text>
          <Text style={bulletPoint}>
            •{" "}
            <Link style={link} href="https://lmnr.ai/docs/evaluations" target="_blank">
              Evaluations
            </Link>
            {" — run evals against datasets locally or in CI. Catch regressions before they ship."}
          </Text>
        </div>
        <Text style={text}>
          Laminar is fully open source — don{"'"}t forget to
          <Link style={link} href="https://github.com/lmnr-ai/lmnr" target="_blank">
            {" star ⭐ our repo on GitHub"}
          </Link>
          {"!"}
        </Text>
        <Text style={text}>
          Got questions or want to pair on your setup? Just
          <Link style={link} href="https://cal.com/robert-lmnr/demo" target="_blank">
            {" grab a slot on my calendar"}
          </Link>
          {"."}
        </Text>
        <Text style={text}>Happy building!</Text>
        <Text style={signature}>Robert</Text>
        <Text style={role}>Co-founder & CEO @ Laminar</Text>
      </div>
    </Html>
  );
}

const text = {
  fontFamily: "'Inter', 'Roboto', 'Helvetica', sans-serif",
  fontSize: "13px",
  fontWeight: "400",
  lineHeight: "19.5px",
};

const container = {
  margin: "0 auto",
  padding: "20px",
  maxWidth: "500px",
};

const heading = {
  ...text,
  fontSize: "24px",
  fontWeight: "600",
  marginBottom: "24px",
};

const link = {
  color: "#2563eb",
  textDecoration: "none",
};

const signature = {
  ...text,
  marginTop: "24px",
  fontWeight: "500",
};

const role = {
  ...text,
  color: "#6b7280",
  fontSize: "12px",
};

const bulletList = {
  marginLeft: "20px",
  marginBottom: "16px",
};

const bulletPoint = {
  ...text,
  marginBottom: "8px",
};
