"use client";

import { useCallback, useState } from "react";

import { type SignalTabKey } from "@/components/landing/sections/clusters-mock-data";
import { cn } from "@/lib/utils";

import { bodyLarge } from "../../class-names_old";
import SignalsMockUI from "./signals-mock-ui";
import { ANYTHING_PROMPT, type TabKey, TABS } from "./tabs";

interface Props {
  className?: string;
}

const RIGHT_HEIGHT = 731;
const RIGHT_WIDTH = 920;

const SignalsSectionDesktop = ({ className }: Props) => {
  const [activeTab, setActiveTab] = useState<TabKey>("detect-failures");
  const [promptValue, setPromptValue] = useState(TABS[0].quote);
  const mockTabKey: SignalTabKey = activeTab === "anything" ? "detect-failures" : activeTab;

  const handleTabClick = useCallback((tab: (typeof TABS)[number]) => {
    setActiveTab(tab.key);
    setPromptValue(tab.quote);
  }, []);

  return (
    <div className={cn("flex flex-col items-center w-full gap-8", className)}>
      <div className="flex bg-landing-surface-700 gap-[32px] h-[671px] items-start overflow-hidden rounded w-full relative flex-row pl-7 pt-7 pb-8">
        <div className="absolute left-0 bottom-0 w-full bg-gradient-to-t from-landing-surface-700 to-transparent h-[140px] z-10 pointer-events-none" />

        <div className="flex flex-col font-normal h-full items-start justify-start shrink-0 w-[340px] gap-8 z-20">
          <div className="flex flex-row gap-2 items-center w-full">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => handleTabClick(tab)}
                  className={cn(
                    "flex-1 min-w-0 flex items-center justify-center px-1 py-2 rounded border transition-colors text-center leading-tight",
                    "font-sans text-sm text-landing-text-100 whitespace-nowrap truncate",
                    isActive
                      ? "bg-landing-surface-500 border-landing-surface-400"
                      : "bg-landing-surface-600 border-landing-surface-500 hover:bg-landing-surface-500/50"
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-col pl-2">
            <p className="font-space-grotesk text-2xl leading-8 w-full text-primary-foreground mb-6">
              {activeTab === "anything" ? (
                <>
                  <span className="inline-block w-[2px] h-[1em] bg-landing-primary-400 align-middle landing-caret-blink" />
                  <span className="text-landing-text-400">{ANYTHING_PROMPT}</span>
                </>
              ) : (
                `"${promptValue}"`
              )}
            </p>
            <p className={cn("w-full text-landing-text-300 mb-6", bodyLarge)}>Don't dig through your agent logs.</p>
            <p className={cn("w-full text-landing-text-300", bodyLarge)}>
              Your agent data is organized into clusters so you can focus on high level patterns.
            </p>
          </div>
        </div>

        <div className="relative shrink-0" style={{ height: RIGHT_HEIGHT, width: RIGHT_WIDTH }}>
          <SignalsMockUI key={mockTabKey} tabKey={mockTabKey} className="h-full" />
        </div>
      </div>
    </div>
  );
};

export default SignalsSectionDesktop;
