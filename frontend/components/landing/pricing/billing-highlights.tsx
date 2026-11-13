import { cn } from "@/lib/utils";

import { bodyMedium, microLabel, subSection } from "../class-names";
import LearnMoreLink from "../sections/learn-more-link";

// Average Signals cost per analyzed trace across Laminar Cloud, model inference included.
export const AVG_TRACE_ANALYSIS_COST_USD = 0.002;

const COMPRESSION_BLOG_URL = "https://laminar.sh/blog/laminar-20x-agent-trace-compression";
const FLOW_ONE_BLOG_URL = "https://laminar.sh/blog/flow-1";

interface Highlight {
  stat: string;
  statCaption: string;
  title: string;
  body: string;
  link: { label: string; href: string };
}

const HIGHLIGHTS: Highlight[] = [
  {
    stat: "20x",
    statCaption: "average reduction in stored data",
    title: "Data is billed after compression",
    body: "Agents resend their whole history on every LLM call, so raw traces grow quadratically. Laminar stores each unique message and tool definition once per trace, and bills only those bytes.",
    link: { label: "How trace compression works", href: COMPRESSION_BLOG_URL },
  },
  {
    stat: `$${AVG_TRACE_ANALYSIS_COST_USD}`,
    statCaption: "average cost to analyze a trace",
    title: "Analysis includes the model",
    body: "That's the full Signals run, model inference included. There's no per-evaluation fee on top of a separate LLM bill, and no API key to bring.",
    link: { label: "Why analysis costs this little", href: FLOW_ONE_BLOG_URL },
  },
];

export default function BillingHighlights() {
  return (
    <section className="flex w-full flex-col gap-10">
      <div className="flex flex-col gap-2">
        <h2 className={subSection}>You pay for less than you send</h2>
        <p className={bodyMedium}>Two things keep a Laminar bill smaller than the raw numbers suggest.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {HIGHLIGHTS.map((h) => (
          <div key={h.title} className="flex flex-col gap-6 rounded bg-surface-450 p-6">
            <div className="flex flex-col gap-1">
              <span className="font-sans-landing text-5xl font-medium leading-none tracking-[-0.02em] text-primary-100">
                {h.stat}
              </span>
              <span className={cn(microLabel, "text-sm")}>{h.statCaption}</span>
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <p className="font-sans-landing text-lg text-white">{h.title}</p>
              <p className="font-sans-landing text-base text-foreground-200">{h.body}</p>
            </div>
            <LearnMoreLink label={h.link.label} href={h.link.href} />
          </div>
        ))}
      </div>
    </section>
  );
}
