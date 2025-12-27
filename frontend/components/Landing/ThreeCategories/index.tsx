import { cn } from "@/lib/utils";

import DocsButton from "../DocsButton";
import PlaceholderImage from "../PlaceholderImage";
import SectionName from "../SectionName";
import SQLImage from "./SQLImage";
import IntegrateInMinutes from "./IntegrateInMinutes";
import PlaygroundImage from "./PlaygroundImage";
import { sectionHeaderLarge, bodyLarge, subsectionTitle, cardTitle, bodyMedium, bodySQL } from "../classNames";

interface Props {
  className?: string;
}

const ThreeCategories = ({ className }: Props) => {
  return (
    <div
      className={cn(
        "bg-landing-surface-800 flex flex-col items-center justify-center px-0 py-[220px] w-full",
        className
      )}
    >
      <div className="flex flex-col gap-[240px] items-start w-[1080px] max-w-[1186px]">
        {/* Header */}
        <div className="flex flex-col gap-10 items-start w-full">
          <div className={cn(sectionHeaderLarge, "w-[1160px]")}>
            <p>Features for </p>
            <p>every step of </p>
            <p>the development cycle</p>
          </div>
          <div className={cn(bodyLarge, "min-w-full w-full flex flex-col items-end")}>
            <p className="mb-0">Our comprehensive platform gives </p>
            <p className="mb-0">you the tools you need to build </p>
            <p className="font-normal text-white">modern AI agents</p>
          </div>
        </div>

        {/* TRACING Section */}
        <SectionName label="TRACING" index={1} />

        <IntegrateInMinutes />

        {/* Understand traces easily */}
        <div className="flex flex-col gap-[54px] items-start w-full">
          <div className="flex flex-col gap-1 items-start w-full">
            <p className={subsectionTitle}>Understand traces easily</p>
            <p className={bodyLarge}>Get used to insights being front and center</p>
          </div>
          <div className="flex gap-[30px] h-[481px] items-start w-full">
            <div className="basis-0 bg-landing-surface-700 flex grow h-full items-end justify-center overflow-hidden p-8 rounded-lg shrink-0 relative">
              <PlaceholderImage className="absolute bg-landing-surface-500 border border-landing-surface-400 h-[942px] left-[100px] top-[-28px] w-[624px]" />
              <div className="basis-0 flex flex-col gap-6 grow items-start min-h-px min-w-px relative z-10 shrink-0">
                <div className="flex flex-col gap-1 items-start w-full">
                  <p className={cn(cardTitle, "w-full")}>Full context at a glance</p>
                  <p className={cn(bodyMedium, "w-full")}>
                    Long-running, complex trace? No problem. Enjoy visualization tools built to handle complexity. Let
                    us find the story in your data.
                  </p>
                </div>
                <DocsButton />
              </div>
            </div>
            <div className="bg-landing-surface-700 flex h-full items-end justify-center overflow-hidden p-8 rounded-lg shrink-0 w-[432px] relative">
              <PlaceholderImage className="absolute bg-landing-surface-500 border border-landing-surface-400 h-[942px] left-[72px] top-[80px] w-[597px]" />
              <div className="basis-0 flex flex-col gap-6 grow items-start min-h-px min-w-px relative z-10 shrink-0">
                <div className="flex flex-col gap-1 items-start w-full">
                  <p className={cn(cardTitle, "w-full")}>Convoluted Trace? Ask AI</p>
                  <p className={cn(bodyMedium, "w-full")}>Ask AI to summarize and interpret your trace data.</p>
                </div>
                <DocsButton />
              </div>
            </div>
          </div>
        </div>

        {/* Activate Playground */}
        <div className="flex items-start gap-[40px] w-full">
          <div className="flex flex-col gap-[50px] items-start w-[380px]">
            <div className="flex flex-col gap-6 items-start w-full">
              <div className={cn(subsectionTitle, "w-full")}>
                <p className="mb-0">Activate Playground </p>
                <p>from any context</p>
              </div>
              <p className={cn(bodyMedium, "w-full")}>
                Move any span straight into Playground, context preserved. Change models, tweak prompts, and validate
                improvements all without starting from scratch.
              </p>
            </div>
            <DocsButton />
          </div>
          <PlaygroundImage className="relative shrink-0 w-[720px] h-[450px]" />
        </div>

        {/* ANALYSIS Section */}
        <SectionName label="ANALYSIS" index={2} />

        <div className="flex flex-col gap-[54px] items-start w-full">
          <div className="flex flex-col gap-1 items-start w-full">
            <p className={subsectionTitle}>More signal, less noise</p>
            <p className={bodyLarge}>Get used to insights being front and center</p>
          </div>
          <div className="flex gap-[30px] h-[481px] items-start w-full">
            <div className="basis-0 bg-landing-surface-700 flex grow h-full items-end justify-center overflow-hidden p-8 rounded-lg shrink-0 relative">
              <PlaceholderImage className="absolute bg-landing-surface-500 border border-landing-surface-400 h-[942px] left-[100px] top-[-28px] w-[624px]" />
              <div className="basis-0 flex flex-col gap-6 grow items-start min-h-px min-w-px relative z-10 shrink-0">
                <div className="flex flex-col gap-1 items-start w-full">
                  <p className={cn(cardTitle, "w-full")}>Automatic trace clustering</p>
                  <p className={cn(bodyMedium, "w-full")}>
                    Calling the wrong tool? Clicking the wrong button? Laminar categorizes traces based on agent
                    behavior so you can debug faster.
                  </p>
                </div>
                <DocsButton />
              </div>
            </div>
            <div className="basis-0 bg-landing-surface-700 flex grow h-full items-end justify-center overflow-hidden p-8 rounded-lg shrink-0 relative">
              <PlaceholderImage className="absolute bg-landing-surface-500 border border-landing-surface-400 h-[942px] left-[72px] top-[80px] w-[597px]" />
              <div className="basis-0 flex flex-col gap-6 grow items-start min-h-px min-w-px relative z-10 shrink-0">
                <div className="flex flex-col gap-1 items-start w-full">
                  <p className={cn(cardTitle, "w-full")}>You describe it, we track it</p>
                  <p className={cn(bodyMedium, "w-full")}>
                    Use natural language prompts to describe semantic events. Laminar finds matching traces
                    automatically.
                  </p>
                </div>
                <DocsButton />
              </div>
            </div>
          </div>
        </div>

        {/* Capture what your agent sees */}
        <div className="flex items-start justify-between w-full">
          <div className="flex flex-col gap-[50px] items-start w-[380px]">
            <div className="flex flex-col gap-6 items-start w-full">
              <p className={subsectionTitle}>Capture what your agent sees</p>
              <p className={bodyMedium}>
                Browser screen recordings automatically synced with your agent traces. Works with BrowserUse, Stagehand,
                and Playwright
              </p>
            </div>
            <DocsButton />
          </div>
          <div className="relative shrink-0 w-[664px] h-[415px]">
            <PlaceholderImage className="absolute inset-0 pb-0 pl-[100px] pr-0 pt-20 rounded-sm" />
          </div>
        </div>

        {/* Custom dashboards */}
        <div className="flex items-start justify-between w-full">
          <div className="flex flex-col gap-[50px] items-start w-[380px]">
            <div className="flex flex-col gap-6 items-start w-full">
              <p className={subsectionTitle}>Custom dashboards</p>
              <div className={bodyMedium}>
                <p className="mb-0">Track what's important to you, with all platform data ready for action. </p>
                <p className="mb-0"> </p>
                <p>Powered by our state-of-the-art SQL query engine.</p>
              </div>
            </div>
            <DocsButton />
          </div>
          <div className="relative shrink-0 w-[664px] h-[415px]">
            <PlaceholderImage className="absolute inset-0 pb-0 pl-[100px] pr-0 pt-20 rounded-sm" />
          </div>
        </div>

        {/* EVALS Section */}
        <SectionName label="EVALS" index={3} />

        <div className="flex flex-col gap-[54px] items-start w-full">
          <div className="flex flex-col gap-1 items-start w-full">
            <p className={subsectionTitle}>Did someone say Evals?</p>
            <p className={bodyLarge}>Verify progress, catch regressions, and iterate with confidence</p>
          </div>
          <DocsButton />
          <div className="flex flex-col gap-16 items-start w-full">
            <div className="bg-landing-surface-700 flex h-[630px] items-center justify-center overflow-hidden p-8 rounded-lg w-full relative">
              <PlaceholderImage className="absolute inset-0" />
            </div>
            <div className="flex gap-10 items-start w-full">
              <div className="basis-0 flex flex-col gap-6 grow items-start min-h-px min-w-px opacity-80 relative shrink-0">
                <div className="flex flex-col gap-1 items-start w-full">
                  <p className={cn(cardTitle, "w-full")}>An SDK you want to use</p>
                  <p className={cn(bodyMedium, "w-full")}>Dataset, evaluator, run. Simple.</p>
                </div>
                <div className="bg-landing-surface-700 flex h-[283px] items-start overflow-hidden pb-0 pl-[60px] pr-10 pt-10 rounded-sm w-full relative">
                  <PlaceholderImage className="absolute inset-0" />
                </div>
              </div>
              <div className="basis-0 flex flex-col gap-6 grow items-start min-h-px min-w-px opacity-80 relative shrink-0">
                <div className="flex flex-col gap-1 items-start w-full">
                  <p className={cn(cardTitle, "w-full")}>As granular as you want</p>
                  <p className={cn(bodyMedium, "w-full")}>
                    See high level results or dive deep into your individual traces.
                  </p>
                </div>
                <div className="bg-landing-surface-700 flex h-[283px] items-start overflow-hidden pb-0 pl-20 pr-10 pt-10 rounded-sm w-full relative">
                  <PlaceholderImage className="absolute inset-0" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* By the power of SQL */}
        <div className="flex flex-col items-start w-full">
          <div className="flex items-start justify-between w-full">
            <div className="flex flex-col gap-[50px] items-start w-[380px]">
              <div className="flex flex-col gap-6 items-start w-full">
                <p className={subsectionTitle}>By the power of SQL</p>
                <div className="flex flex-col items-start w-[380px]">
                  <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-[18px] w-full">
                    <p className={cn(bodySQL, "basis-0 grow min-h-px min-w-px")}>
                      Feed your Evals with Datasets straight from SQL queries
                    </p>
                  </div>
                  <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-[18px] w-full">
                    <p className={cn(bodySQL, "basis-0 grow min-h-px min-w-px")}>Query all platform data with SQL</p>
                  </div>
                  <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-[18px] w-full">
                    <p className={cn(bodySQL, "basis-0 grow min-h-px min-w-px")}>
                      SQL API to pull data into your application
                    </p>
                  </div>
                </div>
              </div>
              <DocsButton />
            </div>
            <SQLImage className="relative shrink-0 w-[664px] h-[415px]" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThreeCategories;
