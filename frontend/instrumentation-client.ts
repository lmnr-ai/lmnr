// This file configures the initialization of Sentry on the client (browser).
// The config you add here will be used whenever a page is visited.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

import { resolveSamplingConfig, shouldSendTransaction } from "@/lib/sentry/sampling";

if (process.env.LAMINAR_CLOUD === "true") {
  // Inlined at build time (see the `env` block in next.config.ts) — the browser
  // has no runtime env.
  const samplingConfig = resolveSamplingConfig({
    sampleRate: process.env.EXTERNAL_TRACING_SAMPLE_RATE,
    minDurationSecs: process.env.SENTRY_MIN_SAMPLED_DURATION_SECS,
  });

  Sentry.init({
    dsn: "https://0acd62b621df6df93ef143408334027c@o4510193435475968.ingest.us.sentry.io/4510193666555904",

    // Start every transaction; sampling happens in beforeSendTransaction, which
    // can see the finished transaction's duration and status.
    tracesSampleRate: 1,

    integrations: [Sentry.browserTracingIntegration()],
    beforeSendTransaction(event) {
      if (
        event.transaction &&
        event.transaction.includes("/api/projects/") &&
        event.transaction.includes("/realtime")
      ) {
        return null;
      }

      if (!shouldSendTransaction(event, samplingConfig)) {
        return null;
      }

      if (
        (event.contexts?.trace?.op === "navigation" || event.contexts?.trace?.op === "pageload") &&
        typeof window !== "undefined"
      ) {
        event.transaction = window.location.pathname;
      }

      return event;
    },
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
