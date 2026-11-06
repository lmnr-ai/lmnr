import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

// Every mutating route export must decide explicitly whether it is audited:
// `export const POST = handlerWithAudit(...)` (or `handlerWithAudit<Params>(...)`) or `export const POST = handlerNoAudit("reason", ...)`.
const API_ROOT = join(__dirname, "../app/api");
const MUTATING = /^export (?:async function|const) (POST|PUT|PATCH|DELETE)\b(.*)$/gm;

// Routes not classified yet. Shrinks to empty; never add to it.
const PENDING = new Set<string>([
  "announcements/[announcementId]/dismissal/route.ts PUT",
  "auth/[...all]/route.ts DELETE",
  "auth/[...all]/route.ts PATCH",
  "auth/[...all]/route.ts POST",
  "auth/[...all]/route.ts PUT",
  "broker/slack/redeem/route.ts POST",
  "broker/slack/start/route.ts POST",
  "internal/projects/[projectId]/alerts/[alertId]/route.ts DELETE",
  "internal/projects/[projectId]/alerts/[alertId]/route.ts PATCH",
  "internal/projects/[projectId]/alerts/route.ts POST",
  "internal/projects/[projectId]/dashboards/[dashboardId]/charts/route.ts DELETE",
  "internal/projects/[projectId]/dashboards/[dashboardId]/charts/route.ts PUT",
  "internal/projects/[projectId]/dashboards/[dashboardId]/route.ts DELETE",
  "internal/projects/[projectId]/dashboards/[dashboardId]/route.ts PATCH",
  "internal/projects/[projectId]/dashboards/route.ts POST",
  "projects/[projectId]/agents/[agentId]/route.ts PATCH",
  "projects/[projectId]/alerts/[alertId]/filters/route.ts DELETE",
  "projects/[projectId]/alerts/[alertId]/filters/route.ts POST",
  "projects/[projectId]/alerts/[alertId]/filters/route.ts PUT",
  "projects/[projectId]/alerts/[alertId]/route.ts PATCH",
  "projects/[projectId]/alerts/route.ts DELETE",
  "projects/[projectId]/alerts/route.ts POST",
  "projects/[projectId]/chat/route.ts POST",
  "projects/[projectId]/custom-model-costs/copy/route.ts POST",
  "projects/[projectId]/custom-model-costs/route.ts DELETE",
  "projects/[projectId]/custom-model-costs/route.ts POST",
  "projects/[projectId]/dashboards/[dashboardId]/charts/[chartId]/duplicate/route.ts POST",
  "projects/[projectId]/dashboards/[dashboardId]/charts/[chartId]/move/route.ts POST",
  "projects/[projectId]/dashboards/[dashboardId]/charts/[chartId]/route.ts DELETE",
  "projects/[projectId]/dashboards/[dashboardId]/charts/[chartId]/route.ts PATCH",
  "projects/[projectId]/dashboards/[dashboardId]/charts/[chartId]/route.ts PUT",
  "projects/[projectId]/dashboards/[dashboardId]/charts/route.ts PATCH",
  "projects/[projectId]/dashboards/[dashboardId]/charts/route.ts POST",
  "projects/[projectId]/dashboards/[dashboardId]/route.ts DELETE",
  "projects/[projectId]/dashboards/[dashboardId]/route.ts PATCH",
  "projects/[projectId]/dashboards/route.ts POST",
  "projects/[projectId]/datasets/[datasetId]/datapoints/[datapointId]/route.ts POST",
  "projects/[projectId]/datasets/[datasetId]/datapoints/[datapointId]/versions/route.ts POST",
  "projects/[projectId]/datasets/[datasetId]/datapoints/push-to-queue/route.ts POST",
  "projects/[projectId]/datasets/[datasetId]/datapoints/route.ts DELETE",
  "projects/[projectId]/datasets/[datasetId]/datapoints/route.ts POST",
  "projects/[projectId]/datasets/[datasetId]/file-upload/route.ts POST",
  "projects/[projectId]/datasets/[datasetId]/parquets/route.ts POST",
  "projects/[projectId]/datasets/[datasetId]/route.ts PATCH",
  "projects/[projectId]/datasets/route.ts DELETE",
  "projects/[projectId]/datasets/route.ts POST",
  "projects/[projectId]/debugger-sessions/[sessionId]/blocks/route.ts POST",
  "projects/[projectId]/debugger-sessions/[sessionId]/route.ts PATCH",
  "projects/[projectId]/debugger-sessions/route.ts POST",
  "projects/[projectId]/evaluation-groups/[groupId]/progression/route.ts POST",
  "projects/[projectId]/evaluations/[evaluationId]/route.ts PATCH",
  "projects/[projectId]/evaluations/[evaluationId]/route.ts PUT",
  "projects/[projectId]/evaluations/route.ts DELETE",
  "projects/[projectId]/evaluations/trial-comparison/route.ts POST",
  "projects/[projectId]/onboarding/state/route.ts DELETE",
  "projects/[projectId]/onboarding/state/route.ts POST",
  "projects/[projectId]/playgrounds/[playgroundId]/route.ts POST",
  "projects/[projectId]/playgrounds/route.ts DELETE",
  "projects/[projectId]/playgrounds/route.ts POST",
  "projects/[projectId]/queues/[queueId]/annotation-schema/route.ts PUT",
  "projects/[projectId]/queues/[queueId]/items/[itemId]/route.ts DELETE",
  "projects/[projectId]/queues/[queueId]/items/[itemId]/route.ts PATCH",
  "projects/[projectId]/queues/[queueId]/push-to-dataset/route.ts POST",
  "projects/[projectId]/queues/[queueId]/push/route.ts POST",
  "projects/[projectId]/queues/route.ts DELETE",
  "projects/[projectId]/queues/route.ts POST",
  "projects/[projectId]/render-templates/[templateId]/route.ts DELETE",
  "projects/[projectId]/render-templates/[templateId]/route.ts PUT",
  "projects/[projectId]/render-templates/generate/route.ts POST",
  "projects/[projectId]/render-templates/route.ts POST",
  "projects/[projectId]/sessions/route.ts DELETE",
  "projects/[projectId]/signals/[id]/jobs/route.ts POST",
  "projects/[projectId]/signals/[id]/route.ts DELETE",
  "projects/[projectId]/signals/[id]/route.ts PUT",
  "projects/[projectId]/signals/[id]/triggers/route.ts DELETE",
  "projects/[projectId]/signals/[id]/triggers/route.ts POST",
  "projects/[projectId]/signals/[id]/triggers/route.ts PUT",
  "projects/[projectId]/signals/execute/route.ts POST",
  "projects/[projectId]/signals/route.ts DELETE",
  "projects/[projectId]/signals/route.ts POST",
  "projects/[projectId]/signals/route.ts PUT",
  "projects/[projectId]/spans/[spanId]/export/route.ts POST",
  "projects/[projectId]/spans/[spanId]/push/route.ts POST",
  "projects/[projectId]/spans/route.ts DELETE",
  "projects/[projectId]/sql/export-job/route.ts POST",
  "projects/[projectId]/sql/export/[datasetId]/route.ts POST",
  "projects/[projectId]/sql/from-json/route.ts POST",
  "projects/[projectId]/sql/generate/route.ts POST",
  "projects/[projectId]/sql/route.ts POST",
  "projects/[projectId]/sql/templates/[templateId]/route.ts DELETE",
  "projects/[projectId]/sql/templates/[templateId]/route.ts PUT",
  "projects/[projectId]/sql/templates/route.ts POST",
  "projects/[projectId]/sql/to-json/route.ts POST",
  "projects/[projectId]/tag-classes/[tagName]/route.ts DELETE",
  "projects/[projectId]/tag-classes/[tagName]/route.ts POST",
  "projects/[projectId]/traces/[traceId]/render-data/route.ts POST",
  "projects/[projectId]/traces/[traceId]/spans/previews/route.ts POST",
  "projects/[projectId]/traces/[traceId]/spans/system-messages/route.ts POST",
  "projects/[projectId]/traces/[traceId]/tags/[tagName]/route.ts DELETE",
  "projects/[projectId]/traces/[traceId]/tags/route.ts POST",
  "projects/[projectId]/traces/output/route.ts POST",
  "projects/[projectId]/traces/route.ts DELETE",
  "projects/[projectId]/views/[viewId]/route.ts DELETE",
  "projects/[projectId]/views/[viewId]/route.ts PATCH",
  "projects/[projectId]/views/route.ts POST",
  "shared/traces/[traceId]/spans/previews/route.ts POST",
  "webhook/slack/route.ts POST",
  "webhook/stripe/route.ts POST",
  "workspaces/[workspaceId]/llm-profiles/test/route.ts POST",
  "workspaces/[workspaceId]/notifications/route.ts POST",
  "workspaces/[workspaceId]/reports/excluded-projects/route.ts POST",
  "workspaces/[workspaceId]/reports/route.ts DELETE",
  "workspaces/[workspaceId]/reports/route.ts POST",
  "workspaces/[workspaceId]/reports/route.ts PUT",
  "workspaces/[workspaceId]/reports/slack-target/route.ts POST",
  "workspaces/[workspaceId]/slack/channels/[channelId]/test/route.ts POST",
]);

const routeFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return name === "route.ts" ? [path] : [];
  });

test("every mutating route export is wrapped in handlerWithAudit or handlerNoAudit", () => {
  const unclassified: string[] = [];
  for (const file of routeFiles(API_ROOT)) {
    const source = readFileSync(file, "utf8");
    for (const [, method, rest] of source.matchAll(MUTATING)) {
      const key = `${relative(API_ROOT, file)} ${method}`;
      if (/^\s*=\s*(handlerWithAudit|handlerNoAudit)(<[^(]*>)?\(/.test(rest) || PENDING.has(key)) continue;
      unclassified.push(key);
    }
  }
  assert.deepEqual(unclassified, [], "wrap these exports in handlerWithAudit(...) or handlerNoAudit(reason, ...)");
});

test("pending list only names routes that still need classifying", () => {
  const stale = [...PENDING].filter((key) => {
    const [path, method] = key.split(" ");
    const source = readFileSync(join(API_ROOT, path), "utf8");
    return !new RegExp(
      `^export (?:async function|const) ${method}\\b(?!\\s*=\\s*(?:handlerWithAudit|handlerNoAudit)(?:<[^(]*>)?\\()`,
      "m"
    ).test(source);
  });
  assert.deepEqual(stale, [], "remove these from PENDING");
});

// Each audited export names what it acted on; nothing is inferred from the path, body or response.
const AUDITED = /^export const (\w+)\s*=\s*handlerWithAudit(?:<[^(]*>)?\(\s*(\{[^}]*\})/gm;

test("every audited handler names its target", () => {
  const missing: string[] = [];
  for (const file of routeFiles(API_ROOT)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(AUDITED)) {
      const [, method, meta] = match;
      const start = match.index + match[0].length;
      const next = source.indexOf("\nexport ", start);
      const body = source.slice(start, next === -1 ? undefined : next);
      const key = `${relative(API_ROOT, file)} ${method}`;
      if (/\bnoTarget:\s*true\b/.test(meta)) continue;
      // A delete reads the names before the rows are gone.
      if (/action:\s*"delete"/.test(meta) && !/\bawait audit\.target\(|\baudit\.skip\(/.test(body)) {
        missing.push(`${key} (delete: await audit.target(...) before deleting)`);
      } else if (!/\baudit\.(target|skip)\(/.test(body)) {
        missing.push(key);
      }
    }
  }
  assert.deepEqual(missing, [], "call audit.target(...) in these handlers, or set noTarget: true in their meta");
});
