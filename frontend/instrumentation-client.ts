// This file configures the initialization of Sentry on the client (browser).
// The config you add here will be used whenever a page is visited.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

if (process.env.LAMINAR_CLOUD === "true") {
  // Sentry.init({
  //   dsn: "https://0acd62b621df6df93ef143408334027c@o4510193435475968.ingest.us.sentry.io/4510193666555904",
  //
  //   tracesSampleRate: 1,
  //
  //   integrations: [Sentry.browserTracingIntegration()],
  //   beforeSendTransaction(event) {
  //     if (
  //       event.transaction &&
  //       event.transaction.includes("/api/projects/") &&
  //       event.transaction.includes("/realtime")
  //     ) {
  //       return null;
  //     }
  //
  //     if (
  //       (event.contexts?.trace?.op === "navigation" || event.contexts?.trace?.op === "pageload") &&
  //       typeof window !== "undefined"
  //     ) {
  //       event.transaction = window.location.pathname;
  //     }
  //
  //     return event;
  //   },
  // });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
