// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

import { resolveSamplingConfig, shouldSendTransaction } from "@/lib/sentry/sampling";

if (process.env.LAMINAR_CLOUD === "true" && process.env.FRONTEND_SENTRY_DSN) {
  const samplingConfig = resolveSamplingConfig({
    sampleRate: process.env.EXTERNAL_TRACING_SAMPLE_RATE,
    minDurationSecs: process.env.SENTRY_MIN_SAMPLED_DURATION_SECS,
  });

  Sentry.init({
    dsn: process.env.FRONTEND_SENTRY_DSN,

    // Start every transaction; the actual sampling happens in
    // beforeSendTransaction, which — unlike tracesSampler — can see the
    // finished transaction's duration and status.
    tracesSampleRate: 1,

    // Enable sending user PII (Personally Identifiable Information)
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
    sendDefaultPii: true,

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

      return event;
    },
  });
}
