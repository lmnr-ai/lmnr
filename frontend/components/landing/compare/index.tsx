import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { bodyMedium, LANDING_COLUMN_MAX_W, mainTitle, microLabel, subSection } from "../class-names";
import CTAButtons from "../cta-buttons";
import Footer from "../footer";
import Header from "../header";
import Divider from "../sections/divider";

interface Differentiator {
  step: string;
  title: string;
  body: string;
  learnMore: { label: string; href: string };
}

const DIFFERENTIATORS: Differentiator[] = [
  {
    step: "01.",
    title: "Transcript view, not a span tree",
    body: "The debugger renders a run top-to-bottom: input, every LLM turn, tool calls, and subagents as ordered cards. You read it instead of expanding a nested tree.",
    learnMore: { label: "Debugger", href: "https://laminar.sh/docs/debugger/introduction" },
  },
  {
    step: "02.",
    title: "Outcomes, not scores",
    body: "Define an outcome in plain language plus a JSON schema. Signals emit structured, queryable payloads on matching traces, backfill over history, fire on new runs, and cluster into failure modes you can alert on.",
    learnMore: { label: "Signals", href: "https://laminar.sh/docs/signals/introduction" },
  },
  {
    step: "03.",
    title: "Storage scales linearly",
    body: "Agents replay their full message history every turn, so naive tracing stores the same bytes O(turns²). Laminar deduplicates messages by content hash: ~20x less storage on average, up to 50x on long coding agents.",
    learnMore: {
      label: "Trace compression",
      href: "https://laminar.sh/blog/laminar-20x-agent-trace-compression",
    },
  },
  {
    step: "04.",
    title: "SQL, and open source",
    body: "Query traces, signal events, clusters, evals, and datasets with ClickHouse SQL from the editor, REST API, CLI, or MCP — no custom dialect. Apache 2.0, self-hostable, every feature included.",
    learnMore: { label: "GitHub", href: "https://github.com/lmnr-ai/lmnr" },
  },
];

const DifferentiatorSection = ({ step, title, body, learnMore }: Differentiator) => (
  <section className="flex flex-col items-start w-full">
    <span className={cn(microLabel, "mb-2")}>{step}</span>
    <h2 className={cn(subSection, "mb-3")}>{title}</h2>
    <p className={cn(bodyMedium, "mb-4")}>{body}</p>
    <Link
      href={learnMore.href}
      target="_blank"
      className={cn(microLabel, "inline-flex items-center gap-1 hover:text-landing-text-200 transition-colors")}
    >
      {learnMore.label}
      <ArrowUpRight className="size-4.5 translate-y-[1.5px]" strokeWidth={1.5} />
    </Link>
  </section>
);

interface Props {
  hasSession: boolean;
}

const Compare = ({ hasSession }: Props) => (
  <div className="bg-landing-surface-700 overflow-x-clip flex flex-col min-h-screen">
    <div className="flex flex-col items-center w-full z-10">
      <Header
        hasSession={hasSession}
        className={cn("w-full pt-4 px-6 lg:px-0", LANDING_COLUMN_MAX_W)}
        isIncludePadding
      />

      <div className="flex flex-col items-center w-full px-6 lg:px-0 pt-[100px] pb-[72px] md:pb-[120px]">
        <div className={cn("flex flex-col items-start gap-[80px] w-full", LANDING_COLUMN_MAX_W)}>
          <div className="flex flex-col items-start gap-4">
            <h1 className={cn(mainTitle, "tracking-[-0.015em]")}>How is Laminar different?</h1>
            <p className="font-sans-landing text-[20px] text-landing-text-200">
              Built for debugging agents in production: find a failure, fix it, confirm it. Four things set it apart.
            </p>
          </div>

          <div className="flex flex-col items-start gap-[80px] w-full">
            {DIFFERENTIATORS.map((d) => (
              <DifferentiatorSection key={d.step} {...d} />
            ))}
          </div>

          <Divider />

          <section className="flex flex-col items-start gap-6 w-full">
            <h2 className={subSection}>More detail</h2>
            <p className={bodyMedium}>A feature-by-feature comparison with another platform.</p>
            <Link
              href="https://laminar.sh/blog/laminar-vs-braintrust"
              target="_blank"
              className={cn(microLabel, "inline-flex items-center gap-1 hover:text-landing-text-200 transition-colors")}
            >
              Laminar vs. Braintrust
              <ArrowUpRight className="size-4.5 translate-y-[1.5px]" strokeWidth={1.5} />
            </Link>
          </section>

          <section className="w-full pt-[20px]">
            <CTAButtons className="justify-center md:justify-start w-full" />
          </section>
        </div>
      </div>
    </div>
    <Footer />
  </div>
);

export default Compare;
