"use client";

import dynamic from "next/dynamic";

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

export function ManualTab({ projectId }: { projectId?: string }) {
  return (
    <div className="flex flex-col gap-12 ">
      <div className="flex flex-col gap-3 items-start">
        <h3 className="text-base font-medium">Install Laminar SDK</h3>
        <InstallTabsSection />
      </div>

      <ApiKeyGenerator context="traces" titleClassName="text-base" projectId={projectId} />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-medium">Initialize Laminar</h3>
          <p className="text-sm text-muted-foreground">Add 2 lines of code at the top of your project.</p>
        </div>
        <InitializationTabsSection />
      </div>
    </div>
  );
}
