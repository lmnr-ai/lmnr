"use client";

import dynamic from "next/dynamic";

import FrameworksGrid from "../../integrations/frameworks-grid";
import ApiKeyGenerator from "../../onboarding/api-key-generator";
import { CodingAgentCard } from "./coding-agent-card";

const InstallTabsSection = dynamic(() => import("./tabs-section.tsx").then((mod) => mod.InstallTabsSection), {
  ssr: false,
});

export function ManualTab() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-medium">Copy and paste into your coding agent</h3>
          <p className="text-xs text-muted-foreground">Let your AI coding agent set up Laminar for you.</p>
        </div>
        <CodingAgentCard />
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-base font-medium">Or install manually</h3>
        <InstallTabsSection />
      </div>

      <ApiKeyGenerator context="traces" titleClassName="text-base" />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-medium">Learn more about specific integrations</h3>
          <p className="text-xs text-muted-foreground">
            Learn how to integrate Laminar with your favorite frameworks and SDKs.
          </p>
        </div>
        <FrameworksGrid gridClassName="grid grid-cols-7 gap-4" />
      </div>
    </div>
  );
}
