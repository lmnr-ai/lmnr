import { TRACE_HEALTH_CHECKS, type TraceHealthCheckResult } from "./checks";
import { SPAN_CHECK_COLUMNS } from "./sql";

const INTEGRATIONS_DOCS_URL = "https://laminar.sh/docs/integrations";

const PREAMBLE = [
  "My app is traced with Laminar (OpenTelemetry). Laminar's trace health checks found tracing setup issues.",
  "Find where the app is instrumented and fix them. Prefer the Laminar SDK helpers over raw OTel attributes when the SDK is in use.",
  `Instrumentation instructions for every supported framework and provider: ${INTEGRATIONS_DOCS_URL}`,
].join("\n");

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

/** SQL over the newest traces with one column per failing check, so the agent can confirm its fix. */
const verifyQuery = (results: TraceHealthCheckResult[]) => {
  const spanColumns = results.flatMap((r) => SPAN_CHECK_COLUMNS[r.id] ?? []);
  const checksSession = results.some((r) => r.id === "traces-missing-session");
  const queries: string[] = [];

  if (spanColumns.length > 0) {
    queries.push(
      `SELECT ${["trace_id", "min(start_time) AS started", ...spanColumns].join(", ")} ` +
        "FROM spans WHERE start_time > now() - INTERVAL 1 HOUR GROUP BY trace_id ORDER BY started DESC LIMIT 20"
    );
  }
  if (checksSession) {
    queries.push(
      "SELECT id, start_time, session_id FROM traces WHERE start_time > now() - INTERVAL 1 HOUR ORDER BY start_time DESC LIMIT 20"
    );
  }
  if (queries.length === 0) return "";

  const expectations = [
    spanColumns.some((c) => c.endsWith("root_spans")) ? "`root_spans` should be 1" : null,
    spanColumns.some((c) => !c.endsWith("root_spans")) ? "every `*_missing_*` column should be 0" : null,
    checksSession ? "`session_id` should be set" : null,
  ].filter(Boolean);

  return [
    "## Verify the fix",
    "Run the app once so it sends new traces, then check them with the Laminar CLI:",
    ...queries.map((q) => `lmnr-cli sql query "${q}"`),
    `In the new traces, ${expectations.join(", ")}.`,
  ].join("\n\n");
};

/** A prompt a coding agent can act on to fix the given failing checks. */
export const buildFixPrompt = (results: TraceHealthCheckResult[]) => {
  const failing = results.filter((r) => r.failing > 0);
  return [PREAMBLE, ...failing.map(describe), verifyQuery(failing)].filter(Boolean).join("\n\n");
};
