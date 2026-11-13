import { TRACE_HEALTH_CHECKS, type TraceHealthCheckResult } from "./checks";

const PREAMBLE =
  "My app is traced with Laminar (OpenTelemetry). Laminar's trace health checks found tracing setup issues. " +
  "Find where the app is instrumented and fix them. Prefer the Laminar SDK helpers over raw OTel attributes when the SDK is in use.";

const describe = (result: TraceHealthCheckResult) => {
  const check = TRACE_HEALTH_CHECKS.find((c) => c.id === result.id);
  if (!check) return "";
  return [
    `## ${check.title}`,
    `${result.failing} of ${result.applicable} ${check.unit} are affected. ${check.impact}`,
    `Fix: ${check.fix}`,
    ...(check.docsUrl ? [`Docs: ${check.docsUrl}`] : []),
  ].join("\n");
};

/** A prompt a coding agent can act on to fix the given failing checks. */
export const buildFixPrompt = (results: TraceHealthCheckResult[]) =>
  [PREAMBLE, ...results.filter((r) => r.failing > 0).map(describe)].join("\n\n");
