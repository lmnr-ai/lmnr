import { Html, Link, Preview, Text } from "@react-email/components";

import { buildEmailStyles, defaultEmailTheme, type EmailTheme } from "./theme";

const BULLETS = [
  {
    href: "https://docs.lmnr.ai/tracing/introduction",
    label: "Trace your agents",
    body: " — capture every LLM call and tool invocation with first-class support for AI SDK, LangChain, Browser Use, and more.",
  },
  {
    href: "https://docs.lmnr.ai/signals",
    label: "Signals",
    body: " — describe patterns, errors, and outcomes in natural language and track them across all your traces automatically.",
  },
  {
    href: "https://docs.lmnr.ai/platform/debugger",
    label: "Debugger",
    body: " — rerun long-running agents from any checkpoint without leaving the browser. Tweak prompts, rerun, and inspect the new trace on the same page.",
  },
  {
    href: "https://docs.lmnr.ai/platform/sql-editor",
    label: "SQL engine",
    body: " — query all your trace data, signals, and evaluations directly with SQL. Find patterns the dashboard doesn't anticipate.",
  },
  {
    href: "https://docs.lmnr.ai/evaluations",
    label: "Evaluations",
    body: " — run evals against datasets locally or in CI. Catch regressions before they ship.",
  },
];

export default function WelcomeEmail({ theme = defaultEmailTheme }: { theme?: EmailTheme } = {}) {
  const s = buildEmailStyles(theme);

  return (
    <Html lang="en">
      <Preview>Welcome to Laminar - observability purpose-built for AI agents</Preview>
      <div style={s.container}>
        <Text style={s.heading}>Welcome to Laminar! 👋</Text>
        <Text style={s.text}>I{"'"}m Robert, CEO of Laminar. Stoked to have you join our community!</Text>
        <Text style={s.text}>
          Laminar is an open-source observability platform purpose-built for AI agents. Trace every LLM call, tool
          execution, and custom function, then use captured data to debug, analyze, and improve your agents at scale.
        </Text>
        <Text style={s.text}>Here{"'"}s what you can do:</Text>
        <div style={s.bulletList}>
          {BULLETS.map((bullet) => (
            <Text key={bullet.href} style={s.bulletPoint}>
              •{" "}
              <Link style={s.link} href={bullet.href} target="_blank">
                {bullet.label}
              </Link>
              {bullet.body}
            </Text>
          ))}
        </div>
        <Text style={s.text}>
          Laminar is fully open source — don{"'"}t forget to
          <Link style={s.link} href="https://github.com/lmnr-ai/lmnr" target="_blank">
            {" star ⭐ our repo on GitHub"}
          </Link>
          {"!"}
        </Text>
        <Text style={s.text}>
          Got questions or want to pair on your setup? Just
          <Link style={s.link} href="https://cal.com/robert-lmnr/demo" target="_blank">
            {" grab a slot on my calendar"}
          </Link>
          {"."}
        </Text>
        <Text style={s.text}>Happy building!</Text>
        <Text style={s.signature}>Robert</Text>
        <Text style={s.muted}>Co-founder & CEO @ Laminar</Text>
      </div>
    </Html>
  );
}
