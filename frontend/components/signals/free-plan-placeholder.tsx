"use client";

import { useEffect } from "react";

import UpgradeNotice from "@/components/common/upgrade-notice";
import { ONBOARDING_SIGNALS } from "@/components/onboarding/steps/signals-step/constants";
import PipelineDiagram from "@/components/onboarding/steps/signals-step/pipeline-diagram";
import { Button } from "@/components/ui/button";
import Header from "@/components/ui/header.tsx";
import { ElevatedSurface } from "@/components/ui/surface";
import { track } from "@/lib/posthog";

const STEPS = [
  {
    title: "Describe what to find",
    description: "A failed task, a frustrated user, a wrong tool call. Anything you can put into words.",
  },
  {
    title: "Run on your traces",
    description: "Signals run on every new trace, or on past traces with a backfill.",
  },
  {
    title: "See the patterns",
    description: "Each match becomes an event, and similar events are grouped into clusters.",
  },
];

export default function SignalsFreePlanPlaceholder() {
  useEffect(() => {
    track("signals", "page_viewed", { locked: true });
  }, []);

  return (
    <>
      <Header path="signals" />
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pt-8">
          <div className="flex flex-col gap-3">
            <span className="self-start rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              Starter and Pro
            </span>
            <h1 className="text-2xl font-medium">Signals answer any question, from any trace, at scale.</h1>
            <p className="text-sm text-muted-foreground">
              Ask a question about your agent in plain language, and Signals answer it on every trace. Powered by{" "}
              <a
                href="https://laminar.sh/blog/flow-1"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:underline"
              >
                flow-1
              </a>
              , our model built for trace analysis at very low cost.
            </p>
          </div>

          <div className="overflow-hidden rounded-lg border">
            <PipelineDiagram />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {STEPS.map(({ title, description }, i) => (
              <div key={title} className="flex items-start gap-3">
                <span className="flex size-5 shrink-0 items-center justify-center rounded border bg-muted text-xs text-secondary-foreground">
                  {i + 1}
                </span>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">{title}</span>
                  <span className="text-xs text-muted-foreground">{description}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-medium">Start with ready-made signals</h2>
              <p className="text-xs text-muted-foreground">
                Turn these on in one click, edit them, or write your own for anything you want to track.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {ONBOARDING_SIGNALS.map(({ name, description, icon: Icon }) => (
                <ElevatedSurface key={name} level={5} className="flex flex-col gap-3 rounded-md p-3">
                  <Icon className="size-5 text-primary" />
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-secondary-foreground">{name}</span>
                    <span className="text-xs text-muted-foreground">{description}</span>
                  </div>
                </ElevatedSurface>
              ))}
            </div>
          </div>

          <UpgradeNotice
            title="Signals aren't included in the Free plan"
            description="Upgrade to Starter to run Signals, see clusters and get Slack alerts."
            source="signals"
            actions={
              <a href="https://laminar.sh/docs/signals" target="_blank" rel="noopener noreferrer">
                <Button variant="outline">Docs</Button>
              </a>
            }
          />
        </div>
      </div>
    </>
  );
}
