import { ArrowUpRight, Bug, Database, LayoutDashboard, type LucideIcon, MonitorPlay, Tags } from "lucide-react";
import Link from "next/link";

import { subSection } from "../class-names";

interface CardProps {
  Icon: LucideIcon;
  title: string;
  description: string;
  href: string;
}

const Card = ({ Icon, title, description, href }: CardProps) => (
  <div className="bg-landing-surface-550 flex flex-col h-[200px] px-5 py-4 justify-between rounded">
    <div className="flex items-start justify-between w-full">
      <Icon className="size-10 text-landing-text-300" strokeWidth={0.5} />
      <Link
        href={href}
        target="_blank"
        aria-label={`Learn more about ${title}`}
        className="text-landing-text-300 hover:text-landing-text-200 transition-colors"
      >
        <ArrowUpRight className="size-6" strokeWidth={1.5} />
      </Link>
    </div>
    <div className="flex flex-col gap-2">
      <p className="leading-6 text-white">{title}</p>
      <p className="text-landing-text-200">{description}</p>
    </div>
  </div>
);

const FeaturesForEveryStep = () => (
  <section className="flex flex-col items-start gap-[52px] w-full">
    <h2 className={subSection}>{"Features for every step of agent development"}</h2>
    <div className="grid grid-cols-2 gap-6 w-full">
      <Card
        Icon={Bug}
        title="True Agent Debugger"
        description="Rapid, seamless agent development. Rerun your agent from any step instantly."
        href="https://laminar.sh/docs/debugger"
      />
      <Card
        Icon={LayoutDashboard}
        title="Custom Dashboards"
        description="Build dashboards to track anything with custom SQL queries."
        href="https://laminar.sh/docs/dashboards"
      />
      <Card
        Icon={Database}
        title="Platform-wide SQL"
        description="Build datasets from SQL queries, and have your agent query your data via MCP or CLI."
        href="https://laminar.sh/docs/sql"
      />
      <Card
        Icon={Tags}
        title="Labeling queue"
        description="Build labeled datasets from traces, dataset rows, or SQL results for evals and fine-tuning."
        href="https://laminar.sh/docs/queues/quickstart"
      />
      <Card
        Icon={MonitorPlay}
        title="Browser screen recording"
        description="Replay your agent's browser session alongside the trace."
        href="https://laminar.sh/docs/tracing/browser-sessions"
      />
    </div>
  </section>
);

export default FeaturesForEveryStep;
