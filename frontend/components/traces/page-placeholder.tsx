"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

import { ScrollArea } from "@/components/ui/scroll-area";

import FrameworksGrid from "../integrations/frameworks-grid";
import Header from "../ui/header";

const InstallTabsSection = dynamic(() => import("./tabs-section.tsx").then((mod) => mod.InstallTabsSection), {
  ssr: false,
});

const InitializationTabsSection = dynamic(
  () => import("./tabs-section.tsx").then((mod) => mod.InitializationTabsSection),
  {
    ssr: false,
  }
);

export default function TracesPagePlaceholder() {
  const { projectId } = useParams();

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      <Header path={"traces"} />
      <ScrollArea>
        <div className="flex-1 flex-col mx-auto p-6 overflow-y-auto max-w-[800px] gap-8 pb-16 flex">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">Tracing quickstart</h1>
            <p className="text-muted-foreground">
              You don{"'"}t have any traces in this project yet. Here is how to send your first traces.
            </p>
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Install Laminar SDK</h2>
            <InstallTabsSection />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Generate project API key</h2>
            <p className="text-muted-foreground">
              Go to the{" "}
              <a
                href={`/project/${projectId}/settings`}
                className="text-primary font-medium hover:text-primary/80 transition-colors"
                target="_blank"
              >
                settings page
              </a>{" "}
              to generate a project API key.
            </p>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Learn how to integrate Laminar with your framework or SDK</h2>
            </div>
            <FrameworksGrid gridClassName="grid grid-cols-7 gap-4" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Or add 2 lines of code to auto-instrument your app</h2>
            <p className="text-muted-foreground">
              Initialize Laminar at the top of your project and popular LLM frameworks and SDKs will be traced
              automatically.
            </p>
            <InitializationTabsSection />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Documentation</h2>
            <p className="text-muted-foreground">
              <a
                href="https://docs.lmnr.ai/tracing/introduction"
                className="text-primary font-medium hover:text-primary/80 transition-colors"
                target="_blank"
              >
                Read the docs
              </a>{" "}
              to learn more about adding structure to your traces.
            </p>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
