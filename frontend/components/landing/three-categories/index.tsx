import { cn } from "@/lib/utils";

import { bodyLarge, bodyMedium, bodySQL, cardTitle, subsectionTitle } from "../class-names";
import DocsButton from "../docs-button";
import SectionName from "../section-name";
import AskAIImage from "./ask-ai-image";
import BrowserScreenRecordingImage from "./browser-screen-recording-image";
import ClusteringImage from "./clustering-image";
import DashboardImage from "./dashboard-image";
import DebuggerVideo from "./debugger-video";
import EvalsImage from "./evals-image";
import EvalsSDKImage from "./evals-sdk-image";
import EventDefinitionImage from "./event-definition-image";
import FullContextImage from "./full-context-image";
import GranularEvalsImage from "./granular-evals-image";
import IntegrateInMinutes from "./integrate-in-minutes";
import SQLImage from "./sql-image";

interface Props {
  className?: string;
}

const ThreeCategories = ({ className }: Props) => (
  <div
    className={cn(
      "bg-landing-surface-800 flex flex-col items-center justify-center md:py-[220px] w-full relative md:px-8 overflow-hidden",
      "py-[120px] px-3",
      className
    )}
  >
    <div className={cn("flex flex-col md:gap-[240px] items-start w-[1104px]", "max-w-full gap-[180px]")}>
      {/* Header */}
      <h2
        className={
          "font-space-grotesk tracking-[-1px] font-normal md:leading-[52px] md:text-[48px] text-white text-[28px] leading-[34px]"
        }
      >
        Features for
        <br />
        every step of
        <br />
        agent development
      </h2>

      {/* TRACING Section */}
      <SectionName label="Tracing" index={1} />

      <IntegrateInMinutes />

      <div className={cn("flex flex-col md:gap-[54px] items-start w-full", "gap-8")}>
        <div className="flex flex-col gap-1 items-start w-full">
          <h2 className={subsectionTitle}>True Agent Debugger</h2>
          <p className={bodyLarge}>First-of-its-kind agent developer experience</p>
        </div>
        <div className={cn("flex flex-col md:gap-16 items-start w-full", "gap-8")}>
          <DebuggerVideo />
        </div>
        <DocsButton href="https://docs.laminar.sh/evaluations/introduction" />
      </div>

      {/* Understand traces easily */}
      <div className={cn("flex flex-col md:gap-[54px] items-start w-full", "gap-8")}>
        <div
          className={cn("flex md:flex-row md:gap-[30px] md:h-[481px] items-start w-full", "flex-col gap-4 h-[800px]")}
        >
          <div
            className={cn(
              "basis-0 bg-landing-surface-700 flex grow md:h-full items-end justify-center overflow-hidden md:p-8 rounded-lg shrink-0 relative",
              "flex-1 basis-0 p-6"
            )}
          >
            <FullContextImage className="absolute size-full inset-0" />
            <div className="basis-0 flex flex-col gap-6 grow items-start min-h-px min-w-px relative z-10 shrink-0">
              <div className="flex flex-col gap-1 items-start w-full">
                <p className={cn(cardTitle, "w-full")}>Full trace context at a glance</p>
                <p className={cn(bodyMedium, "w-full")}>
                  Get full context of what your agent was doing and where it went wrong without digging through hundreds
                  of spans.
                </p>
              </div>
              <DocsButton href="https://docs.laminar.sh/tracing/introduction" />
            </div>
          </div>
          <div
            className={cn(
              "bg-landing-surface-700 flex md:h-full items-end justify-center overflow-hidden md:p-8 rounded-lg shrink-0 md:w-[432px] relative",
              "flex-1 basis-0 p-6 w-full"
            )}
          >
            <AskAIImage className="absolute inset-0" />
            <div className="basis-0 flex flex-col gap-6 grow items-start min-h-px min-w-px relative z-10 shrink-0">
              <div className="flex flex-col gap-1 items-start w-full">
                <p className={cn(cardTitle, "w-full")}>Convoluted trace? Ask AI</p>
                <p className={cn(bodyMedium, "w-full")}>
                  Ask our AI agent to summarize, analyze, and debug your trace no matter the complexity.
                </p>
              </div>
              <DocsButton href="https://docs.laminar.sh/platform/viewing-traces#ask-ai" />
            </div>
          </div>
        </div>
      </div>

      {/* Capture what your agent sees */}
      <div className={cn("flex md:flex-row md:items-start md:justify-between w-full -mt-16", "flex-col gap-6")}>
        <div className={cn("flex flex-col gap-[50px] items-start md:max-w-[380px] md:pt-[40px]", "w-full pt-0")}>
          <div className="flex flex-col gap-6 items-start w-full">
            <h2 className={subsectionTitle}>
              Session replay
              <br />
              for browser agents
            </h2>
            <p className={bodyMedium}>
              Laminar captures browser screen recordings and automatically syncs them with agent traces. Easily
              integrates with{" "}
              <span className="font-medium text-primary-foreground">
                Browser Use, Stagehand, Playwright, Kernel, Browserbase, and more.
              </span>
            </p>
          </div>
          <DocsButton href="https://docs.laminar.sh/tracing/browser-agent-observability" />
        </div>
        <BrowserScreenRecordingImage
          className={cn("relative shrink-0 md:w-[720px] md:h-[450px] ", "w-full h-[240px]")}
        />
      </div>

      {/* ANALYSIS Section */}
      <SectionName label="Analysis" index={2} />

      <div className={cn("flex flex-col md:gap-[54px] items-start w-full", "gap-8")}>
        <div className="flex flex-col gap-1 items-start w-full">
          <h2 className={subsectionTitle}>Ask questions. Get answers from every trace at scale.</h2>
          <p className={bodyLarge}>Describe a Signal that you're looking for. Laminar extracts it from past and future traces.</p>
        </div>
        <div
          className={cn("flex md:flex-row md:gap-[30px] md:h-[481px] items-start w-full", "flex-col gap-4 h-[800px]")}
        >
          <div
            className={cn(
              "basis-0 bg-landing-surface-700 flex grow md:h-full items-end justify-center overflow-hidden md:p-8 rounded-lg shrink-0 relative",
              "flex-1 basis-0 p-5"
            )}
          >
            <EventDefinitionImage className="absolute inset-0" />
            <div className="basis-0 flex flex-col gap-6 grow items-start min-h-px min-w-px relative z-10 shrink-0">
              <div className="flex flex-col gap-1 items-start w-full">
                <p className={cn(cardTitle, "w-full")}>Define Signals in plain English</p>
                <p className={cn(bodyMedium, "w-full")}>
                  Ask a question: <span className="text-primary-foreground/80">"Did the agent get stuck in a loop?"</span>. Laminar extracts structured answers from every trace automatically.
                </p>
              </div>
              <DocsButton href="https://docs.laminar.sh/tracing/events/semantic-events" />
            </div>
          </div>
          <div
            className={cn(
              "basis-0 bg-landing-surface-700 flex grow md:h-full items-end justify-center overflow-hidden md:p-8 rounded-lg shrink-0 relative",
              "flex-1 basis-0 p-5"
            )}
          >
            <ClusteringImage className="absolute inset-0" />
            <div className="basis-0 flex flex-col gap-6 grow items-start min-h-px min-w-px relative z-10 shrink-0">
              <div className="flex flex-col gap-1 items-start w-full">
                <p className={cn(cardTitle, "w-full")}>Discover patterns in traces</p>
                <p className={cn(bodyMedium, "w-full")}>
                  Traces are automatically clustered by behavior. Surface failure modes, find outliers, and spot trends.
                </p>
              </div>
              <DocsButton href="https://docs.laminar.sh/tracing/events/clusters" />
            </div>
          </div>
        </div>
      </div>

      {/* By the power of SQL */}
      <div className="flex flex-col items-start w-full">
        <div className={cn("flex md:flex-row md:items-start md:justify-between w-full", "flex-col gap-6")}>
          <div className={cn("flex flex-col gap-[50px] items-start md:max-w-[380px]", "w-full")}>
            <div className="flex flex-col gap-6 items-start w-full">
              <h2 className={subsectionTitle}>Platform-wide SQL</h2>
              <div className={cn("flex flex-col items-start md:max-w-[380px]", "w-full")}>
                <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-[18px] w-full">
                  <p className={cn(bodySQL, "basis-0 grow min-h-px min-w-px")}>Query all platform data with SQL</p>
                </div>
                <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-[18px] w-full">
                  <p className={cn(bodySQL, "basis-0 grow min-h-px min-w-px")}>
                    Feed your Evals with Datasets straight from SQL queries
                  </p>
                </div>
                <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-[18px] w-full">
                  <p className={cn(bodySQL, "basis-0 grow min-h-px min-w-px")}>
                    SQL API to pull data into your application
                  </p>
                </div>
              </div>
            </div>
            <DocsButton href="https://docs.laminar.sh/platform/sql-editor" />
          </div>
          <SQLImage className={cn("relative shrink-0 md:w-[664px] md:h-[415px]", "w-full h-[260px]")} />
        </div>
      </div>

      {/* Custom dashboards */}
      <div className={cn("flex md:flex-row md:items-start md:justify-between w-full", "flex-col gap-6")}>
        <div className={cn("flex flex-col gap-[50px] items-start md:max-w-[380px]", "w-full")}>
          <div className="flex flex-col gap-6 items-start w-full">
            <h2 className={subsectionTitle}>Custom dashboards</h2>

            <div className={cn("flex flex-col items-start md:max-w-[380px]", "w-full")}>
              <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-[18px] w-full">
                <p className={cn(bodySQL, "basis-0 grow min-h-px min-w-px")}>Track tokens, latency, and more.</p>
              </div>
              <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-[18px] w-full">
                <p className={cn(bodySQL, "basis-0 grow min-h-px min-w-px")}>Correlate data across users and sessions.</p>
              </div>
              <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-[18px] w-full">
                <p className={cn(bodySQL, "basis-0 grow min-h-px min-w-px")}>
                  Comprehensive UI dashboard builder with support for <span className="text-primary-foreground">custom SQL queries</span>.
                </p>
              </div>
            </div>
          </div>
          <DocsButton href="https://docs.laminar.sh/custom-dashboards/overview" />
        </div>
        <DashboardImage className={cn("relative shrink-0 md:w-[664px] md:h-[415px]", "w-full h-[260px]")} />
      </div>

      {/* EVALS Section */}
      <SectionName label="Evals" index={3} />

      <div className={cn("flex flex-col md:gap-[54px] items-start w-full", "gap-8")}>
        <div className="flex flex-col gap-1 items-start w-full">
          <h2 className={subsectionTitle}>Robust Evals</h2>
          <p className={bodyLarge}>Verify progress, catch regressions, and iterate with confidence</p>
        </div>
        <div className={cn("flex flex-col md:gap-16 items-start w-full", "gap-8")}>
          <EvalsImage />
          <div
            className={cn("flex md:flex-row md:gap-[30px] md:h-[400px] items-start w-full", "flex-col gap-8 h-[740px]")}
          >
            <div
              className={cn(
                "basis-0 bg-landing-surface-700 flex flex-col grow md:h-full items-start overflow-hidden rounded-lg shrink-0",
                "flex-1 basis-0 w-full"
              )}
            >
              <EvalsSDKImage className="w-full flex-1" />
              <div className={cn("flex flex-col gap-1 items-start w-full md:p-8 h-[35%]", "p-5")}>
                <p className={cn(cardTitle, "w-full")}>Evals SDK you want to use</p>
                <p className={cn(bodyMedium, "w-full")}>
                  Define your agent, dataset, and success metric. We handle the rest.
                </p>
              </div>
            </div>
            <div
              className={cn(
                "basis-0 bg-landing-surface-700 flex flex-col grow md:h-full items-start overflow-hidden rounded-lg shrink-0",
                "flex-1 basis-0 w-full"
              )}
            >
              <GranularEvalsImage className="w-full flex-1" />
              <div className={cn("flex flex-col gap-1 items-start w-full md:p-8 h-[35%]", "p-5")}>
                <p className={cn(cardTitle, "w-full")}>As granular as you want</p>
                <p className={cn(bodyMedium, "w-full")}>
                  See high level results or dive deep into your individual traces.
                </p>
              </div>
            </div>
          </div>
        </div>
        <DocsButton href="https://docs.laminar.sh/evaluations/introduction" />
      </div>
    </div>
    <div className="w-full sticky left-0 bottom-0 h-[100px] bg-gradient-to-t from-landing-surface-800 to-transparent z-30" />
  </div>
);

export default ThreeCategories;
