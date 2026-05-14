"use client";

import Image from "next/image";
import { useCallback, useState } from "react";

import { type SignalTabKey } from "@/components/landing/sections/clusters-mock-data";
import { cn } from "@/lib/utils";

import { ANYTHING_PROMPT, type TabKey, TABS } from "./tabs";

interface Props {
  className?: string;
}

const MOBILE_IMAGE_BY_TAB: Record<SignalTabKey, string> = {
  "detect-failures": "/assets/landing/signals-mock-detect-failures.png",
  "identify-user-friction": "/assets/landing/signals-mock-identify-user-friction.png",
  "monitor-safety": "/assets/landing/signals-mock-monitor-safety.png",
};

const SignalsSectionMobile = ({ className }: Props) => {
  const [activeTab, setActiveTab] = useState<TabKey>("detect-failures");
  const [promptValue, setPromptValue] = useState(TABS[0].quote);
  const mockTabKey: SignalTabKey = activeTab === "anything" ? "detect-failures" : activeTab;

  const handleTabClick = useCallback((tab: (typeof TABS)[number]) => {
    setActiveTab(tab.key);
    setPromptValue(tab.quote);
  }, []);

  return (
    <div className={cn("flex flex-col items-center w-full gap-4", className)}>
      <div className="grid grid-cols-2 gap-2 items-stretch w-full">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleTabClick(tab)}
              className={cn(
                "flex-1 min-w-0 flex items-center justify-center py-2 px-2 rounded transition-colors text-center leading-tight",
                "font-sans text-xs text-landing-text-100",
                isActive
                  ? "bg-landing-surface-600 border border-landing-surface-500"
                  : "bg-landing-surface-700 hover:bg-landing-surface-600/50"
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="bg-landing-surface-700 rounded overflow-hidden relative w-full h-[720px] px-4 py-3">
        <div className="flex flex-col gap-12 h-full items-start">
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-1 items-start w-full shrink-0 h-[150px]">
              <p className="font-sans text-xs leading-4 text-landing-text-300">Prompt</p>
              <p className="font-space-grotesk text-lg leading-6 text-landing-text-100 w-full">
                {activeTab === "anything" ? (
                  <>
                    <span className="inline-block w-[2px] h-[0.9em] bg-landing-primary-400 align-middle landing-caret-blink" />
                    <span className="text-landing-text-400">{ANYTHING_PROMPT}</span>
                  </>
                ) : (
                  `"${promptValue}"`
                )}
              </p>
            </div>
            <div className="flex flex-col gap-6 w-[260px]">
              <p className={cn("font-sans text-base leading-5 w-full text-landing-text-300")}>
                Laminar automatically analyzes your traces, detects events based on your prompt, & creates clusters in
                an organized hierarchy
              </p>
            </div>
          </div>
          <div className="relative shrink-0 w-[474px] h-[479px]">
            <Image
              src={MOBILE_IMAGE_BY_TAB[mockTabKey]}
              alt={`Signals UI — ${mockTabKey}`}
              fill
              sizes="474px"
              className="object-cover"
              priority
            />
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-[122px] bg-gradient-to-t from-landing-surface-700 to-transparent pointer-events-none" />
      </div>
    </div>
  );
};

export default SignalsSectionMobile;
