import { cn } from "@/lib/utils";

import { bodyLarge, bodyMedium, bodySQL, cardTitle, subsectionTitle } from "../class-names";
import DocsButton from "../docs-button";
import ComposableTrace from "./composable-trace";
import DashboardImage from "./dashboard-image";
import EvalsImage from "./evals-image";
import EvalsSDKImage from "./evals-sdk-image";
import GranularEvalsImage from "./granular-evals-image";
import IntegrateInMinutes from "./integrate-in-minutes";
import SignalsSection from "./signals-section";
import SQLImage from "./sql-image";

interface Props {
  className?: string;
}

const ThreeCategories = ({ className }: Props) => (
  <div
    className={cn(
      "bg-landing-surface-800 flex flex-col items-center justify-center md:py-[220px] w-full relative md:px-8",
      "py-[120px] px-3",
      className
    )}
  >
    <div className={cn("flex flex-col md:gap-[240px] items-start w-[1104px]", "max-w-full gap-[180px]")}>
      <IntegrateInMinutes />

      <ComposableTrace />

      <SignalsSection />

      {/* By the power of SQL */}
      <div className="flex flex-col items-start w-full">
        <div className={cn("flex md:flex-row md:items-start md:justify-between w-full", "flex-col gap-6")}>
          <div className={cn("flex flex-col gap-[50px] items-start md:max-w-[380px]", "w-full")}>
            <div className="flex flex-col gap-6 items-start w-full">
              <h2 className={subsectionTitle}>
                Access all your data <br /> with SQL
              </h2>
              <div className={cn("flex flex-col items-start md:max-w-[380px]", "w-full")}>
                <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-[18px] w-full">
                  <p className={cn(bodySQL, "basis-0 grow min-h-px min-w-px")}>
                    Accessible via{" "}
                    <a
                      href="https://laminar.sh/docs"
                      target="_blank"
                      rel="noreferrer"
                      className="underline decoration-1 underline-offset-4 hover:text-landing-text-100"
                    >
                      API
                    </a>
                    ,{" "}
                    <a
                      href="https://laminar.sh/docs/platform/mcp"
                      target="_blank"
                      rel="noreferrer"
                      className="underline decoration-1 underline-offset-4 hover:text-landing-text-100"
                    >
                      MCP
                    </a>
                    ,{" "}
                    <a
                      href="https://laminar.sh/docs/platform/cli"
                      target="_blank"
                      rel="noreferrer"
                      className="underline decoration-1 underline-offset-4 hover:text-landing-text-100"
                    >
                      CLI
                    </a>
                  </p>
                </div>
                <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-[18px] w-full">
                  <p className={cn(bodySQL, "basis-0 grow min-h-px min-w-px")}>Query all platform data with SQL</p>
                </div>
                <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-[18px] w-full">
                  <p className={cn(bodySQL, "basis-0 grow min-h-px min-w-px")}>
                    Feed your Evals with Datasets straight from SQL queries
                  </p>
                </div>
              </div>
            </div>
            <DocsButton href="https://laminar.sh/docs/platform/sql-editor" />
          </div>
          <SQLImage className={cn("relative shrink-0 md:w-[664px] md:h-[415px]", "w-full h-[260px]")} />
        </div>
      </div>

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
        <DocsButton href="https://laminar.sh/docs/evaluations/introduction" />
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
                <p className={cn(bodySQL, "basis-0 grow min-h-px min-w-px")}>
                  Correlate data across users and sessions.
                </p>
              </div>
              <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-[18px] w-full">
                <p className={cn(bodySQL, "basis-0 grow min-h-px min-w-px")}>
                  Comprehensive UI dashboard builder with support for{" "}
                  <span className="text-primary-foreground">custom SQL queries</span>.
                </p>
              </div>
            </div>
          </div>
          <DocsButton href="https://laminar.sh/docs/custom-dashboards/overview" />
        </div>
        <DashboardImage className={cn("relative shrink-0 md:w-[664px] md:h-[415px]", "w-full h-[260px]")} />
      </div>
    </div>
    <div className="w-full sticky left-0 bottom-0 h-[100px] bg-gradient-to-t from-landing-surface-800 to-transparent z-30" />
  </div>
);

export default ThreeCategories;
