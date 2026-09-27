import { Html, Link, Preview, Text } from "@react-email/components";

export default function WelcomeEmail() {
  return (
    <Html lang="en">
      <Preview>Welcome to Laminar - the platform for shipping reliable AI agents</Preview>
      <div style={container}>
        <Text style={heading}>Welcome to Laminar! 👋</Text>
        <Text style={text}>I{"'"}m Robert, CEO of Laminar. Stoked to have you join our community!</Text>
        <Text style={text}>
          Laminar is an open-source platform for shipping reliable AI agents. We catch every agent failure, surface what
          to fix, and confirm the fix resolved it. Agents aren{"'"}t just one LLM call — they loop, branch, and call
          tools, so Laminar is built around the whole run, not a single prompt.
        </Text>
        <Text style={text}>Here{"'"}s how teams get there:</Text>
        <div style={bulletList}>
          <Text style={bulletPoint}>
            •{" "}
            <Link style={link} href="https://laminar.sh/docs/tracing/introduction" target="_blank">
              Tracing
            </Link>
            {
              " — capture every LLM call, tool execution, and decision your agent makes in one trace. OpenTelemetry-native, with first-class support for AI SDK, LangChain, Browser Use, OpenAI Agents, and more."
            }
          </Text>
          <Text style={bulletPoint}>
            •{" "}
            <Link style={link} href="https://laminar.sh/docs/signals/introduction" target="_blank">
              Signals
            </Link>
            {
              ' — describe what to watch for in plain language ("the agent looped without progress," "the user gave up") and Laminar reads every trace, extracts a structured event, and lets you query, cluster, and alert on it across thousands of runs.'
            }
          </Text>
          <Text style={bulletPoint}>
            •{" "}
            <Link style={link} href="https://laminar.sh/docs/platform/debugger" target="_blank">
              Debugger
            </Link>
            {
              " — rerun a long-running agent from any step without leaving the browser. Set a checkpoint, tweak the prompt or config, rerun from there, and inspect the new trace on the same page — no waiting for the agent to crawl back to the moment you care about."
            }
          </Text>
          <Text style={bulletPoint}>
            •{" "}
            <Link style={link} href="https://laminar.sh/docs/platform/sql-editor" target="_blank">
              SQL engine
            </Link>
            {
              " — query all your traces, spans, signal events, and evaluations directly with SQL. Build datasets, answer questions the dashboard doesn't anticipate, or let your own agent query the data via MCP or CLI."
            }
          </Text>
          <Text style={bulletPoint}>
            •{" "}
            <Link style={link} href="https://laminar.sh/docs/evaluations/introduction" target="_blank">
              Evaluations
            </Link>
            {
              " — run a new prompt, model, or agent version against a fixed set of inputs, score every output, and compare runs so you catch regressions before they ship."
            }
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
