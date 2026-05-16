import Image from "next/image";

import { cn } from "@/lib/utils";

import { subSection } from "../class-names";
import LearnMoreLink from "./learn-more-link";

interface CardProps {
  title: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
  learnMoreLabel: string;
  learnMoreHref: string;
  /** Where the screenshot's preserved corner anchors. "top" keeps the app header visible; "bottom" keeps the bottom area visible. */
  anchor?: "top" | "bottom";
}

const Card = ({ title, description, imageSrc, imageAlt, learnMoreLabel, learnMoreHref, anchor = "top" }: CardProps) => (
  <div className="flex min-w-0 flex-col items-start gap-6">
    <div
      className={cn(
        "w-full h-[240px] bg-landing-surface-700 border border-landing-surface-500 rounded overflow-hidden flex",
        anchor === "top" ? "items-start" : "items-end"
      )}
      style={anchor === "top" ? { paddingLeft: 40, paddingTop: 32 } : { paddingLeft: 40, paddingBottom: 32 }}
    >
      <Image
        src={imageSrc}
        alt={imageAlt}
        width={1200}
        height={800}
        style={{ aspectRatio: "auto" }}
        className={cn(
          "max-w-none w-[450px] h-auto border-l border-[#2b2b31]",
          anchor === "top" ? "border-t rounded-tl" : "border-b rounded-bl"
        )}
      />
    </div>
    <div className="flex flex-col items-start gap-2 w-full">
      <p className="font-sans text-landing-text-100 text-lg leading-6">{title}</p>
      <p className="font-sans text-landing-text-300 text-lg leading-6">{description}</p>
    </div>
    <LearnMoreLink label={learnMoreLabel} href={learnMoreHref} />
  </div>
);

const FeaturesForEveryStep = () => (
  <section className="flex flex-col items-start gap-[52px] w-full">
    <h2 className={subSection}>{"Features for every step of agent development"}</h2>
    <div className="grid grid-cols-2 gap-[52px] w-full">
      <Card
        title="True Agent Debugger"
        description="Rapid, seamless agent development. Rerun your agent from any step instantly, instantly reflect changes as you save."
        imageSrc="/assets/landing/debugger.png"
        imageAlt="Laminar debugger session"
        learnMoreLabel="Learn more about debugger"
        learnMoreHref="https://laminar.sh/docs/debugger"
      />
      <Card
        title="Platform-wide SQL"
        description="Query SQL in browser, feed Eval datasets straight from SQL queries, and give your coding agent SQL query access via MCP or CLI."
        imageSrc="/assets/landing/sql.png"
        imageAlt="Laminar SQL editor"
        learnMoreLabel="Learn more about SQL"
        learnMoreHref="https://laminar.sh/docs/sql"
      />
      <Card
        title="Custom Dashboards"
        description="Build dashboards to track anything with custom SQL queries."
        imageSrc="/assets/landing/dashboards-overview.png"
        imageAlt="Laminar custom dashboards"
        learnMoreLabel="Learn more about dashboards"
        learnMoreHref="https://laminar.sh/docs/dashboards"
      />
      <Card
        title="Labeling queue"
        description="Build labeled datasets from traces, dataset rows, or SQL results for evals and fine-tuning."
        imageSrc="/assets/landing/labeling-queue.png"
        imageAlt="Laminar labeling queue"
        learnMoreLabel="Learn more about labeling queues"
        learnMoreHref="https://laminar.sh/docs/queues/quickstart"
      />
      <Card
        title="Browser screen recording"
        description="Replay your agent's browser session alongside the trace. See exactly what the model saw at every step."
        imageSrc="/assets/landing/browser-session.png"
        imageAlt="Laminar browser session recording"
        learnMoreLabel="Learn more about browser recordings"
        learnMoreHref="https://laminar.sh/docs/tracing/browser-sessions"
        anchor="bottom"
      />
    </div>
  </section>
);

export default FeaturesForEveryStep;
