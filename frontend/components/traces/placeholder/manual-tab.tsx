"use client";

import dynamic from "next/dynamic";

import FrameworksGrid from "../../integrations/frameworks-grid";
import ApiKeyGenerator from "../../onboarding/api-key-generator";

const InstallTabsSection = dynamic(() => import("./tabs-section.tsx").then((mod) => mod.InstallTabsSection), {
  ssr: false,
});

const InitializationTabsSection = dynamic(
  () => import("./tabs-section.tsx").then((mod) => mod.InitializationTabsSection),
  {
    ssr: false,
  }
);

export function ManualTab() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h3 className="text-base font-medium">Install Laminar SDK</h3>
        <InstallTabsSection />
      </div>

      <ApiKeyGenerator context="traces" titleClassName="text-base" />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-medium">Integrations</h3>
          <p className="text-xs text-muted-foreground">
            Learn how to integrate Laminar with your favorite frameworks and SDKs.
          </p>
        </div>
        <FrameworksGrid gridClassName="grid grid-cols-7 gap-4" />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-medium">Initialize Laminar</h3>
          <p className="text-xs text-muted-foreground">Add 2 lines of code at the top of your project.</p>
        </div>
        <InitializationTabsSection />
      </div>
    </div>
  );
}
