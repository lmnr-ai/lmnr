import { type ComponentType } from "react";

import Annotation from "./graphics/annotation";
import Dashboards from "./graphics/dashboards";
import InputExtraction from "./graphics/input-extraction";
import ScreenRecording from "./graphics/screen-recording";
import FullTextSearch from "./graphics/search";
import Sql from "./graphics/sql";

export interface CardDef {
  /** `\n` forces a line break — ../card renders it `whitespace-pre-line`. */
  title: string;
  description: string;
  href: string;
  /** Fills the card's graphic band. See ./card for the band's shape. */
  Graphic: ComponentType;
}

export const CARDS: CardDef[] = [
  {
    title: "Automatic agent input extraction",
    description:
      "Laminar extracts the agent's task from every run. Use it to easily create e2e eval datasets from production traces.",
    href: "https://laminar.sh/docs/platform/viewing-traces#inputs-to-every-agent-and-subagent-surfaced-for-free",
    Graphic: InputExtraction,
  },
  {
    title: "Custom dashboards",
    description: "Build dashboards to track statistics from traces and signals with custom SQL queries.",
    href: "https://laminar.sh/docs/custom-dashboards/overview",
    Graphic: Dashboards,
  },
  {
    title: "Full SQL access",
    description: "Query all platform data with raw SQL. Have your coding agent query data with MCP or CLI.",
    href: "https://laminar.sh/docs/platform/sql-editor",
    Graphic: Sql,
  },
  {
    title: "UI for fast data annotation",
    description: "Build labeled datasets from traces, dataset rows, or SQL results for evals and fine-tuning.",
    href: "https://laminar.sh/docs/queues/quickstart",
    Graphic: Annotation,
  },
  {
    title: "Screen recording for browser agents",
    description: "Capture your agent's browser session alongside the trace.",
    href: "https://laminar.sh/docs/tracing/browser-agent-observability",
    Graphic: ScreenRecording,
  },
  {
    title: "Full-text search",
    description: "Full-text search across every span input, output, and attribute.",
    href: "https://laminar.sh/docs/platform/search#full-text-search",
    Graphic: FullTextSearch,
  },
];
