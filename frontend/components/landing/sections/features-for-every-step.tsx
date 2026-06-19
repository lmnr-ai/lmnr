import {
  ArrowUpRight,
  Bug,
  Database,
  LayoutDashboard,
  type LucideIcon,
  MonitorPlay,
  Tags,
  TextSearch,
} from "lucide-react";
import Link from "next/link";

import { subSection } from "../class-names";

interface CardProps {
  Icon: LucideIcon;
  title: string;
  description: string;
  href: string;
}

const Card = ({ Icon, title, description, href }: CardProps) => (
  <Link
    target="_blank"
    aria-label={`Learn more about ${title}`}
    href={href}
    className="bg-surface-500 font-sans-landing flex flex-col h-[180px] px-5 py-4 justify-between rounded transition-all duration-300 hover:bg-surface-200"
  >
    <div className="flex items-start justify-between w-full">
      <Icon className="size-6 text-foreground-300" strokeWidth={1.5} />
      <ArrowUpRight className="size-5 text-foreground-300" strokeWidth={1.5} />
    </div>
    <div className="flex flex-col gap-1">
      <p className="leading-6 text-white text-lg">{title}</p>
      <p className="text-foreground-200">{description}</p>
    </div>
  </Link>
);

const FeaturesForEveryStep = () => (
  <section className="flex flex-col items-start gap-[52px] w-full">
    <h2 className={subSection}>{"One platform for every stage of agent development."}</h2>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
      <Card
        Icon={Bug}
        title="True Agent Debugger"
        description="Rapid, seamless agent development. Rerun your agent from any step instantly."
        href="https://laminar.sh/docs/platform/debugger"
      />
      <Card
        Icon={LayoutDashboard}
        title="Custom Dashboards"
        description="Build dashboards to track statistics from traces and signals with custom SQL queries."
        href="https://laminar.sh/docs/custom-dashboards/overview"
      />
      <Card
        Icon={Database}
        title="Full SQL access to all platform data"
        description="Query all platform data with raw SQL. Have your coding agent query data with MCP or CLI."
        href="https://laminar.sh/docs/platform/sql-editor"
      />
      <Card
        Icon={Tags}
        title="UI for fast data annotation"
        description="Build labeled datasets from traces, dataset rows, or SQL results for evals and fine-tuning."
        href="https://laminar.sh/docs/queues/quickstart"
      />
      <Card
        Icon={MonitorPlay}
        title="Screen recording for browser agents"
        description="Capture your agent's browser session alongside the trace."
        href="https://laminar.sh/docs/tracing/browser-agent-observability"
      />
      <Card
        Icon={TextSearch}
        title="Extremely fast full-text search"
        description="Full-text search across every span input, output, and attribute."
        href="https://laminar.sh/docs/platform/search#full-text-search"
      />
    </div>
  </section>
);

export default FeaturesForEveryStep;
