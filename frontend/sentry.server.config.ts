// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const DEFAULT_SAMPLE_RATE = 0.5;

// Sentry bills by span volume, so only a fraction of transactions is sent.
// Write EXTERNAL_TRACING_SAMPLE_RATE as a plain decimal (e.g. 0.5); anything
// Number won't parse falls back to the default.
//
// Empty/whitespace is treated as unset (a k8s ConfigMap key with no value)
// rather than passed to Number, which reads "" as 0 and would silently disable
// sampling. Same empty-as-unset rule as app-server's NumEnv.
const rawSampleRate = process.env.EXTERNAL_TRACING_SAMPLE_RATE?.trim();
const sampleRate = rawSampleRate ? Number(rawSampleRate) : DEFAULT_SAMPLE_RATE;
const tracesSampleRate = Number.isFinite(sampleRate) ? Math.min(Math.max(sampleRate, 0), 1) : DEFAULT_SAMPLE_RATE;

if (process.env.LAMINAR_CLOUD === "true" && process.env.FRONTEND_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.FRONTEND_SENTRY_DSN,

    // Sampling is per-transaction, so every sampled trace stays internally complete.
    tracesSampleRate,

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
      return event;
    },
  });
}
