import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseAsArrayOf, parseAsString } from "nuqs/server";

import { chartAlertPreset } from "@/components/dashboards/chart-alert";
import { CHART_PRESETS } from "@/components/dashboards/chart-presets";
import { incidentTracesHref, tracesHref } from "@/components/settings/alerts/metric-alert-page/traces-href";
import {
  DEFAULT_FORM_VALUES,
  fromRule,
  suggestResolve,
  toRule,
} from "@/components/settings/alerts/metric-alerts/metric-alert-sheet/form-rule";
import { TEMPLATES } from "@/components/settings/alerts/metric-alerts/metric-alert-sheet/templates";
import { type MetricAlertFormValues } from "@/components/settings/alerts/metric-alerts/metric-alert-sheet/types";
import { alertStatus, cadenceLine, conditionSummary } from "@/components/settings/alerts/metric-alerts/utils";
import { mergeRulePatch, type MetricRule, MetricRuleSchema, wholeNumberError } from "@/lib/actions/alerts/metric-rule";
import { Operator } from "@/lib/actions/common/operators";
import defaultCharts from "@/lib/db/default-charts";

const form = (values: Partial<MetricAlertFormValues>): MetricAlertFormValues => ({ ...DEFAULT_FORM_VALUES, ...values });
const rule = (values: Partial<MetricAlertFormValues>): MetricRule => MetricRuleSchema.parse(toRule(form(values)));
const template = (id: string) => TEMPLATES.find((t) => t.id === id)!.values;

describe("metric alert form", () => {
  it("turns every template into a rule and back without losing a field", () => {
    for (const { id, values } of TEMPLATES) {
      // The budget template leaves the amount to the user.
      if (values.conditionType === "budget") assert.equal(values.budgetAmount, "");
      const filled = form({ ...values, ...(values.conditionType === "budget" && { budgetAmount: "2000" }) });
      const parsed = MetricRuleSchema.safeParse(toRule(filled));
      assert.ok(parsed.success, `template ${id}`);
      const { name: _name, slackChannels: _slack, emailEnabled: _email, ...ruleFields } = filled;
      assert.deepEqual(fromRule(parsed.data), ruleFields, `template ${id}`);
    }
  });

  it("writes the rule JSON the engine reads", () => {
    assert.deepEqual(toRule(form({ ...template("cost-spike"), splitByModel: true })), {
      metric: "total_cost",
      filters: [],
      groupBy: "model",
      window: { minutes: 60 },
      condition: { type: "change", compareTo: "1w" },
      direction: "above",
      warning: 130,
      critical: 150,
      resolve: 120,
      minChange: 1,
      checksInARow: 3,
      minTraces: 50,
      onNoData: null,
    });
  });

  it("stores a budget without thresholds, on the month-to-date window, never split", () => {
    const budget = toRule(form({ ...template("monthly-budget"), budgetAmount: "2000", splitByModel: true }));
    assert.deepEqual(budget.condition, { type: "budget", amount: 2000 });
    assert.deepEqual(budget.window, { monthToDate: true });
    assert.equal(budget.warning, null);
    assert.equal(budget.critical, null);
    assert.equal(budget.groupBy, null);
  });

  it("leaves an empty threshold out instead of storing zero", () => {
    const stopped = toRule(form(template("traffic-stopped")));
    assert.equal(stopped.warning, 1);
    assert.equal(stopped.critical, null);
  });

  it("suggests a resolve threshold a step back towards normal", () => {
    assert.equal(suggestResolve("change", "above", "130"), "120");
    assert.equal(suggestResolve("change", "below", "50"), "60");
    assert.equal(suggestResolve("trace_p99", "above", "300"), "290");
    assert.equal(suggestResolve("value", "above", "5"), "4.5");
    assert.equal(suggestResolve("value", "below", "100"), "110");
    assert.equal(suggestResolve("value", "above", ""), "");
  });
});

describe("metric alert summaries", () => {
  it("describes each kind of condition in one line", () => {
    assert.equal(conditionSummary(rule(template("cost-spike"))), "Total cost over 1 hour above 130% of 1 week earlier");
    assert.equal(
      conditionSummary(rule({ ...template("monthly-budget"), budgetAmount: "2000" })),
      "Monthly budget of $2,000"
    );
    assert.equal(conditionSummary(rule(template("error-rate"))), "Error rate over 15 minutes above 5%");
    assert.equal(
      conditionSummary(rule({ ...template("cost-spike"), splitByModel: true })),
      "Total cost over 1 hour above 130% of 1 week earlier · by model"
    );
  });

  it("calls a budget at warning 'On pace to exceed' and a muted rule 'Muted'", () => {
    const budget = rule({ ...template("monthly-budget"), budgetAmount: "2000" });
    assert.deepEqual(alertStatus({ rule: budget, level: "warning" }), { label: "On pace to exceed", tone: "warning" });
    assert.deepEqual(alertStatus({ rule: budget, level: "critical" }), { label: "Critical", tone: "critical" });
    assert.deepEqual(alertStatus({ rule: { ...budget, disabled: true }, level: "critical" }), {
      label: "Muted",
      tone: "muted",
    });
    assert.deepEqual(alertStatus({ rule: rule(template("error-rate")), level: "warning" }), {
      label: "Warning",
      tone: "warning",
    });
  });

  it("states the check interval and time to fire", () => {
    assert.equal(
      cadenceLine({ checkIntervalMinutes: 6, firesAfterMinutes: 18 }),
      "Checked every 6 min. Fires after about 18 min."
    );
    assert.equal(
      cadenceLine({ checkIntervalMinutes: 60, firesAfterMinutes: 180 }),
      "Checked every 1 h. Fires after about 3 h."
    );
  });
});

describe("chartAlertPreset", () => {
  const preset = (name: string) => {
    const { query, queryStructure } = CHART_PRESETS.find((p) => p.name === name)!;
    return { name, query, settings: { queryStructure } as never };
  };
  const seeded = (name: string) => {
    const { query, settings } = defaultCharts.find((c) => c.name === name)!;
    return { name, query, settings };
  };

  it("maps the four alertable presets to their metric", () => {
    assert.deepEqual(chartAlertPreset(preset("Total cost")), { name: "Total cost", metric: "total_cost" });
    assert.deepEqual(chartAlertPreset(preset("Total tokens")), { name: "Total tokens", metric: "total_tokens" });
    assert.deepEqual(chartAlertPreset(preset("Tokens by model")), {
      name: "Tokens by model",
      metric: "total_tokens",
      splitByModel: true,
    });
    assert.deepEqual(chartAlertPreset(preset("New traces")), { name: "New traces", metric: "trace_count" });
  });

  it("offers no alert on the other presets", () => {
    const others = CHART_PRESETS.filter(
      (p) => !["Total cost", "Total tokens", "Tokens by model", "New traces"].includes(p.name)
    );
    assert.ok(others.length > 0);
    for (const { name } of others) assert.equal(chartAlertPreset(preset(name)), null, name);
  });

  it("recognizes the same charts seeded into a new project, which have no query structure", () => {
    assert.equal(chartAlertPreset(seeded("Total cost"))?.metric, "total_cost");
    assert.equal(chartAlertPreset(seeded("Total tokens"))?.metric, "total_tokens");
    assert.deepEqual(chartAlertPreset(seeded("Tokens by model (sum)")), {
      name: "Tokens by model (sum)",
      metric: "total_tokens",
      splitByModel: true,
    });
    assert.equal(chartAlertPreset(seeded("Cost by model (sum)")), null);
  });

  it("offers no alert once a preset is edited, or on custom SQL", () => {
    const edited = preset("Total cost");
    const structure = CHART_PRESETS.find((p) => p.name === "Total cost")!.queryStructure;
    edited.settings = {
      queryStructure: { ...structure, filters: [...structure.filters, { field: "model", op: "eq", stringValue: "x" }] },
    } as never;
    assert.equal(chartAlertPreset(edited), null);
    assert.equal(
      chartAlertPreset({
        name: "Mine",
        query: "SELECT sum(total_cost) FROM spans WHERE model = 'x'",
        settings: {} as never,
      }),
      null
    );
  });
});

const budget = rule({ ...template("monthly-budget"), budgetAmount: "2000" });

describe("traces link", () => {
  const filtered = rule({
    ...template("error-rate"),
    filters: [
      { column: "user_id", operator: Operator.Eq, value: "u1" },
      { column: "status", operator: Operator.Eq, value: "error" },
    ],
  });

  it("carries the time range, each rule filter, and sorts by cost", () => {
    const href = tracesHref("p1", filtered, new Date("2026-01-01T10:00:00Z"), new Date("2026-01-01T11:00:00Z"));
    const url = new URL(href, "http://localhost");
    assert.equal(url.pathname, "/project/p1/traces");
    assert.equal(url.searchParams.get("startDate"), "2026-01-01T10:00:00.000Z");
    assert.equal(url.searchParams.get("endDate"), "2026-01-01T11:00:00.000Z");
    // Read back the way the traces table does (nuqs `parseAsArrayOf`).
    assert.deepEqual(parseAsArrayOf(parseAsString).parse(url.searchParams.get("filter") ?? ""), [
      JSON.stringify({ column: "user_id", operator: "eq", value: "u1" }),
      JSON.stringify({ column: "status", operator: "eq", value: "error" }),
    ]);
    assert.equal(url.searchParams.get("sortBy"), "cost");
    assert.equal(url.searchParams.get("sortDirection"), "desc");
  });

  it("starts an incident's range at the first window that breached", () => {
    // Opened 12:00 after 6 minutes of breaching checks over a 15 minute window.
    const incident = { openedAt: "2026-01-01 12:00:00+00", resolvedAt: "2026-01-01 12:30:00+00" };
    const url = new URL(incidentTracesHref("p1", filtered, incident, { firesAfterMinutes: 6 })!, "http://localhost");
    assert.equal(url.searchParams.get("startDate"), "2026-01-01T11:39:00.000Z");
    assert.equal(url.searchParams.get("endDate"), "2026-01-01T12:30:00.000Z");
  });

  it("gives no incident link while the cadence is unknown", () => {
    const incident = { openedAt: "2026-01-01 12:00:00+00", resolvedAt: null };
    assert.equal(incidentTracesHref("p1", filtered, incident, undefined), null);
  });

  it("starts a budget incident's range at the start of the UTC month", () => {
    const incident = { openedAt: "2026-01-20 12:00:00+00", resolvedAt: null };
    const now = new Date("2026-01-21T00:00:00Z");
    // The month start does not depend on how often the rule is checked.
    const url = new URL(incidentTracesHref("p1", budget, incident, undefined, now)!, "http://x");
    assert.equal(url.searchParams.get("startDate"), "2026-01-01T00:00:00.000Z");
    assert.equal(url.searchParams.get("endDate"), "2026-01-21T00:00:00.000Z");
  });
});

describe("metric rule patches", () => {
  const stored = budget;

  it("changes a budget's amount and keeps its type", () => {
    const merged = MetricRuleSchema.parse(mergeRulePatch(stored, { condition: { amount: 3000 } }));
    assert.deepEqual(merged.condition, { type: "budget", amount: 3000 });
    assert.deepEqual({ ...merged, condition: stored.condition }, stored);
  });

  it("drops the old condition's fields when the type changes", () => {
    const change = rule(template("cost-spike"));
    const merged = MetricRuleSchema.parse(mergeRulePatch(change, { condition: { type: "value" }, warning: 5 }));
    assert.deepEqual(merged.condition, { type: "value" });
    assert.equal(merged.warning, 5);
    assert.equal(merged.critical, change.critical);
  });

  it("names the field when a count is not a whole number", () => {
    const parsed = MetricRuleSchema.safeParse({ ...stored, checksInARow: 2.5 });
    assert.equal(parsed.success, false);
    assert.equal(wholeNumberError(parsed.error!), "Checks in a row must be a whole number");
    const other = MetricRuleSchema.safeParse({ ...stored, metric: "nope" });
    assert.equal(wholeNumberError(other.error!), undefined);
  });
});
