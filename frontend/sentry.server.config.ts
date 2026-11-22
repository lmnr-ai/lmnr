// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const DEFAULT_SAMPLE_RATE = 0.5;

// Set by Laminar's span processor on every span it starts.
const LAMINAR_SPAN_ATTRIBUTE = "lmnr.span.instrumentation_source";

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

    // Sampling is decided once per trace at its root span, so every sampled trace stays internally complete.
    tracesSampleRate,

    // `dataCollection` stays at its defaults on purpose: we want full request context (user info, cookies, headers,
    // HTTP bodies, gen-AI inputs/outputs) on events. Secrets are scrubbed by key name only.

    // Drop the long-lived realtime SSE request together with its child spans. `ignoreSpans` is matched when a span
    // starts, before Next.js renames the root span to its route, so match the raw request target (may carry basePath).
    ignoreSpans: [
      {
        attributes: {
          "next.span_type": "BaseServer.handleRequest",
          "http.target": /\/api\/projects\/[^/?]+\/realtime(?:[/?]|$)/,
        },
      },
    ],
  });

  // Laminar makes its own span the active OTel span while an AI SDK tool runs. A Sentry span started there (a DB
  // query, a fetch) would join Laminar's trace, inherit its always-on sampling and reach Sentry orphaned: drop it.
  Sentry.getClient()?.on("prepareSpanScope", (spanScope) => {
    const { parentSpan, scope } = spanScope;
    if (!parentSpan || Sentry.spanToJSON(parentSpan).attributes?.[LAMINAR_SPAN_ATTRIBUTE] === undefined) {
      return;
    }
    const unsampledScope = scope.clone();
    unsampledScope.setPropagationContext({ ...scope.getPropagationContext(), sampled: false });
    spanScope.scope = unsampledScope;
    spanScope.parentSpan = undefined;
  });
}
