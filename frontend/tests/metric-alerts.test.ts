import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { chartAlertPreset } from "@/components/dashboards/chart-alert";
import { CHART_PRESETS } from "@/components/dashboards/chart-presets";
import {
  currentTracesHref,
  incidentTracesHref,
  tracesHref,
} from "@/components/settings/alerts/metric-alert-page/traces-href";
import {
  DEFAULT_FORM_VALUES,
  fromRule,
  thresholdsLine,
  toRule,
} from "@/components/settings/alerts/metric-alerts/metric-alert-sheet/form-rule";
import {
  niceCeil,
  probeRule,
  suggestValues,
  usualPeak,
} from "@/components/settings/alerts/metric-alerts/metric-alert-sheet/suggestions";
import { TEMPLATES } from "@/components/settings/alerts/metric-alerts/metric-alert-sheet/templates";
import { type MetricAlertFormValues } from "@/components/settings/alerts/metric-alerts/metric-alert-sheet/types";
import { thresholdLines } from "@/components/settings/alerts/metric-alerts/rule-chart/series";
import {
  alertStatus,
  alertsWhen,
  cadenceLine,
  conditionSummary,
} from "@/components/settings/alerts/metric-alerts/utils";
import {
  mergeRulePatch,
  type MetricRule,
  MetricRuleSchema,
  MetricRuleWriteSchema,
  wholeNumberError,
} from "@/lib/actions/alerts/metric-rule";
import { METRIC_ALERT_TEMPLATES, TEMPLATE_CATEGORIES } from "@/lib/actions/alerts/metric-templates";
import defaultCharts from "@/lib/db/default-charts";

const form = (values: Partial<MetricAlertFormValues>): MetricAlertFormValues => ({ ...DEFAULT_FORM_VALUES, ...values });
const rule = (values: Partial<MetricAlertFormValues>): MetricRule => MetricRuleSchema.parse(toRule(form(values)));
const formTemplate = (id: string) => TEMPLATES.find((t) => t.id === id)!;
const template = (id: string) => formTemplate(id).values;
/** One preview point per entry: `[day of the month, hour, value]`. */
const points = (...entries: [number, number, number | null][]) =>
  entries.map(([day, hour, value]) => ({ at: new Date(Date.UTC(2026, 0, day, hour)).toISOString(), value }));

describe("metric alert templates", () => {
  it("offers seven templates, each in one of the two categories", () => {
    assert.deepEqual(
      TEMPLATE_CATEGORIES.map((category) =>
        METRIC_ALERT_TEMPLATES.filter((t) => t.category === category).map((t) => t.id)
      ),
      [
        ["cost-spike", "llm-error-spike", "llm-error-rate", "slow-llm-calls"],
        ["traffic-stopped", "cost-tracking-stopped", "token-usage-missing"],
      ]
    );
  });

  it("turns every template into a rule and back without losing a field", () => {
    for (const { id, values } of TEMPLATES) {
      const filled = form(values);
      const parsed = MetricRuleSchema.safeParse(toRule(filled));
      assert.ok(parsed.success, `template ${id}`);
      const { name: _name, slackChannels: _slack, emailEnabled: _email, ...ruleFields } = filled;
      assert.deepEqual(fromRule(parsed.data), ruleFields, `template ${id}`);
    }
  });

  it("sets no resolve threshold, so every template resolves at its warning", () => {
    for (const { id, values } of TEMPLATES) assert.equal(values.resolve, "", id);
  });
});

describe("metric alert suggestions", () => {
  it("takes the usual peak as the median of each day's highest value", () => {
    assert.equal(usualPeak(points([1, 3, 2], [1, 9, 8], [2, 4, 4], [3, 5, 40], [3, 6, 1])), 8);
    assert.equal(usualPeak(points([1, 3, 2], [2, 4, 6])), 4);
    // Days without traffic do not pull the peak down.
    assert.equal(usualPeak(points([1, 3, 0], [2, 4, null], [3, 5, 6])), 6);
    assert.equal(usualPeak(points([1, 3, 0], [2, 4, null])), null);
  });

  it("rounds a threshold up to a number that reads well", () => {
    assert.equal(niceCeil(0.0351), 0.04);
    assert.equal(niceCeil(13), 15);
    assert.equal(niceCeil(10), 10);
    assert.equal(niceCeil(1.1, true), 2);
    assert.equal(niceCeil(0), 0);
  });

  it("puts warning and critical above the usual peak", () => {
    assert.deepEqual(suggestValues(formTemplate("slow-llm-calls"), 12), { warning: "20", critical: "40" });
    // A fast project keeps the template's own thresholds as a floor.
    assert.deepEqual(suggestValues(formTemplate("slow-llm-calls"), 2), { warning: "10", critical: "30" });
  });

  it("suggests nothing without data or for a template with fixed thresholds", () => {
    assert.equal(suggestValues(formTemplate("slow-llm-calls"), null), null);
    assert.equal(suggestValues(formTemplate("llm-error-rate"), 12), null);
  });

  it("reads a template's series with a rule that can be saved and never fires", () => {
    const probed = TEMPLATES.filter((t) => t.suggest);
    assert.deepEqual(
      probed.map((t) => t.id),
      ["slow-llm-calls"]
    );
    for (const t of probed) assert.ok(MetricRuleSchema.safeParse(probeRule(t)).success, t.id);
    assert.equal(probeRule(formTemplate("slow-llm-calls")).warning, 1e15);
    assert.equal(probeRule(formTemplate("slow-llm-calls")).critical, null);
  });

  it("names the thresholds a template would set", () => {
    assert.equal(thresholdsLine(form(template("llm-error-rate"))), "Warning above 5% · Critical above 20%");
    assert.equal(thresholdsLine(form(template("traffic-stopped"))), "Warning below 1");
    assert.equal(thresholdsLine(form(template("cost-spike"))), "Warning above 150% · Critical above 300%");
    assert.equal(thresholdsLine(form(template("slow-llm-calls"))), "Warning above 10 s · Critical above 30 s");
    assert.equal(thresholdsLine(form({})), null);
  });
});

describe("metric alert form", () => {
  it("writes the rule JSON the engine reads", () => {
    assert.deepEqual(toRule(form({ ...template("cost-spike"), splitByModel: true })), {
      metric: "total_cost",
      groupBy: "model",
      window: { minutes: 60 },
      condition: { type: "change", compareTo: "1d" },
      direction: "above",
      warning: 150,
      critical: 300,
      // Left out, so the engine resolves at the warning threshold.
      resolve: null,
      minChange: 1,
      checksInARow: 3,
      minCalls: 50,
      onNoData: null,
    });
  });

  it("never splits the span count by model, and keeps a minimum change to change rules", () => {
    const stopped = toRule(form({ ...template("traffic-stopped"), splitByModel: true, minChange: "3" }));
    assert.equal(stopped.groupBy, null);
    assert.equal(stopped.minChange, null);
    for (const metric of ["llm_calls", "llm_errors", "llm_error_rate", "llm_latency_p95"] as const) {
      assert.equal(toRule(form({ metric, splitByModel: true })).groupBy, "model", metric);
    }
  });

  it("stores a minimum of LLM calls only for rates and latencies", () => {
    assert.equal(toRule(form({ metric: "llm_error_rate", minCalls: "5" })).minCalls, 5);
    assert.equal(toRule(form({ metric: "llm_latency_p50", minCalls: "5" })).minCalls, 5);
    assert.equal(toRule(form({ metric: "llm_errors", minCalls: "5" })).minCalls, 50);
    assert.equal(toRule(form({ metric: "total_cost", minCalls: "5" })).minCalls, 50);
  });

  it("keeps a resolve threshold the user typed", () => {
    assert.equal(toRule(form({ ...template("llm-error-rate"), resolve: "3" })).resolve, 3);
    assert.equal(toRule(form(template("llm-error-rate"))).resolve, null);
  });

  it("leaves an empty threshold out instead of storing zero", () => {
    const stopped = toRule(form(template("traffic-stopped")));
    assert.equal(stopped.warning, 1);
    assert.equal(stopped.critical, null);
  });

  it("compares a change with 15 minutes earlier unless told otherwise", () => {
    assert.deepEqual(rule({ conditionType: "change", warning: "150" }).condition, { type: "change", compareTo: "15m" });
    assert.equal(template("cost-spike").compareTo, "1d");
    assert.equal(template("llm-error-spike").compareTo, "1h");
  });

  it("points the missing cost and token templates at LLM calls, which can be split by model", () => {
    assert.equal(template("cost-tracking-stopped").metric, "llm_no_cost_rate");
    assert.equal(template("token-usage-missing").metric, "llm_no_tokens_rate");
    const split = rule({ ...template("cost-tracking-stopped"), splitByModel: true });
    assert.equal(split.groupBy, "model");
    assert.equal(split.minCalls, 20);
  });

  it("accepts the count metrics, the 30 minute window and the 30 minutes earlier comparison", () => {
    for (const metric of ["span_count", "llm_calls", "llm_errors"] as const) {
      const parsed = rule({ metric, window: "30", conditionType: "change", compareTo: "30m", warning: "150" });
      assert.equal(parsed.metric, metric);
      assert.deepEqual(parsed.window, { minutes: 30 });
      assert.deepEqual(parsed.condition, { type: "change", compareTo: "30m" });
    }
  });
});

describe("metric alert summaries", () => {
  it("describes each kind of condition in one line", () => {
    assert.equal(conditionSummary(rule(template("cost-spike"))), "Total cost over 1 hour above 150% of 1 day earlier");
    assert.equal(
      conditionSummary(rule(template("llm-error-spike"))),
      "Failed LLM calls over 15 minutes above 200% of 1 hour earlier"
    );
    assert.equal(conditionSummary(rule(template("llm-error-rate"))), "LLM error rate over 15 minutes above 5%");
    assert.equal(conditionSummary(rule(template("traffic-stopped"))), "Span count over 15 minutes below 1");
    assert.equal(conditionSummary(rule(template("slow-llm-calls"))), "p95 LLM latency over 15 minutes above 10 s");
    assert.equal(
      conditionSummary(rule({ ...template("cost-spike"), splitByModel: true })),
      "Total cost over 1 hour above 150% of 1 day earlier · by model"
    );
  });

  it("reads a rule back as an 'Alerts when' sentence", () => {
    assert.equal(
      alertsWhen(toRule(form({ warning: "5", critical: "10" }))),
      "Alerts when total cost over the last hour is above $5.00 (warning) or $10.00 (critical)."
    );
    assert.equal(
      alertsWhen(toRule(form(template("traffic-stopped")))),
      "Alerts when span count over the last 15 minutes is below 1 (warning)."
    );
    assert.equal(
      alertsWhen(toRule(form(template("cost-tracking-stopped")))),
      "Alerts when LLM calls with no cost over the last hour is above 50% (warning) or 90% (critical)."
    );
    assert.equal(
      alertsWhen(toRule(form(template("cost-spike")))),
      "Alerts when total cost over the last hour is above 150% (warning) or 300% (critical) of the same window 1 day earlier."
    );
    assert.equal(
      alertsWhen(toRule(form(template("slow-llm-calls")))),
      "Alerts when p95 LLM latency over the last 15 minutes is above 10 s (warning) or 30 s (critical)."
    );
    assert.equal(
      alertsWhen(toRule(form({ ...template("slow-llm-calls"), splitByModel: true }))),
      "Alerts when p95 LLM latency of a model over the last 15 minutes is above 10 s (warning) or 30 s (critical)."
    );
  });

  it("has no sentence until a threshold is set", () => {
    assert.equal(alertsWhen(toRule(form({}))), null);
  });

  it("draws a line for each threshold the rule sets", () => {
    assert.deepEqual(
      thresholdLines(rule(template("llm-error-rate"))).map((line) => line.label),
      ["Critical 20%", "Warning 5%"]
    );
    assert.deepEqual(thresholdLines(rule({ ...template("slow-llm-calls"), critical: "", resolve: "8" })), [
      { key: "warning", value: 10, label: "Warning 10 s" },
      { key: "resolve", value: 8, label: "Resolve 8 s" },
    ]);
  });

  it("calls a level by its name and a muted rule 'Muted'", () => {
    const errorRate = rule(template("llm-error-rate"));
    assert.deepEqual(alertStatus({ rule: errorRate, level: "warning" }), { label: "Warning", tone: "warning" });
    assert.deepEqual(alertStatus({ rule: errorRate, level: "critical" }), { label: "Critical", tone: "critical" });
    assert.deepEqual(alertStatus({ rule: { ...errorRate, disabled: true }, level: "critical" }), {
      label: "Muted",
      tone: "muted",
    });
    assert.deepEqual(alertStatus({ rule: errorRate, level: "ok" }), { label: "OK", tone: "ok" });
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

  it("maps the three alertable presets to their metric", () => {
    assert.deepEqual(chartAlertPreset(preset("Total cost")), { name: "Total cost", metric: "total_cost" });
    assert.deepEqual(chartAlertPreset(preset("Total tokens")), { name: "Total tokens", metric: "total_tokens" });
    assert.deepEqual(chartAlertPreset(preset("Tokens by model")), {
      name: "Tokens by model",
      metric: "total_tokens",
      splitByModel: true,
    });
  });

  it("offers no alert on the other presets", () => {
    const others = CHART_PRESETS.filter((p) => !["Total cost", "Total tokens", "Tokens by model"].includes(p.name));
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

  it("falls back to the query text when the stored structure is incomplete", () => {
    const partial = (name: string) => ({ ...preset(name), settings: { queryStructure: { table: "spans" } } as never });
    assert.equal(chartAlertPreset(partial("Total cost"))?.metric, "total_cost");
    assert.equal(chartAlertPreset({ ...partial("Total cost"), query: "SELECT 1" }), null);
  });
});

describe("traces link", () => {
  const errorRate = rule(template("llm-error-rate"));

  it("carries the time range and sorts by cost", () => {
    const href = tracesHref("p1", new Date("2026-01-01T10:00:00Z"), new Date("2026-01-01T11:00:00Z"));
    const url = new URL(href, "http://localhost");
    assert.equal(url.pathname, "/project/p1/traces");
    assert.equal(url.searchParams.get("startDate"), "2026-01-01T10:00:00.000Z");
    assert.equal(url.searchParams.get("endDate"), "2026-01-01T11:00:00.000Z");
    assert.equal(url.searchParams.get("sortBy"), "cost");
    assert.equal(url.searchParams.get("sortDirection"), "desc");
  });

  it("starts an incident's range at the first window that breached", () => {
    // Opened 12:00 after 6 minutes of breaching checks over a 15 minute window.
    const incident = { openedAt: "2026-01-01 12:00:00+00", resolvedAt: "2026-01-01 12:30:00+00" };
    const url = new URL(incidentTracesHref("p1", errorRate, incident, { firesAfterMinutes: 6 })!, "http://localhost");
    assert.equal(url.searchParams.get("startDate"), "2026-01-01T11:39:00.000Z");
    assert.equal(url.searchParams.get("endDate"), "2026-01-01T12:30:00.000Z");
  });

  it("gives no incident link while the cadence is unknown", () => {
    const incident = { openedAt: "2026-01-01 12:00:00+00", resolvedAt: null };
    assert.equal(incidentTracesHref("p1", errorRate, incident, undefined), null);
  });

  it("covers the last day for a rule with no open incident", () => {
    const { searchParams } = new URL(currentTracesHref("p1", new Date("2026-01-21T08:30:00Z")), "http://x");
    assert.equal(searchParams.get("startDate"), "2026-01-20T08:30:00.000Z");
    assert.equal(searchParams.get("endDate"), "2026-01-21T08:30:00.000Z");
  });
});

describe("metric rule patches", () => {
  const stored = rule(template("cost-spike"));

  it("changes what a change rule compares with and keeps its type", () => {
    const merged = MetricRuleSchema.parse(mergeRulePatch(stored, { condition: { compareTo: "1w" } }));
    assert.deepEqual(merged.condition, { type: "change", compareTo: "1w" });
    assert.deepEqual({ ...merged, condition: stored.condition }, stored);
  });

  it("refuses a key a rule does not have when saving", () => {
    const refused = MetricRuleWriteSchema.safeParse({ ...stored, filters: [] });
    assert.equal(refused.success, false);
    assert.match(refused.error?.issues[0].message ?? "", /filters/);
    for (const t of METRIC_ALERT_TEMPLATES) {
      assert.ok(MetricRuleWriteSchema.safeParse(toRule(form(template(t.id)))).success, t.id);
    }
  });

  it("drops the old condition's fields when the type changes", () => {
    const merged = MetricRuleSchema.parse(mergeRulePatch(stored, { condition: { type: "value" }, warning: 5 }));
    assert.deepEqual(merged.condition, { type: "value" });
    assert.equal(merged.warning, 5);
    assert.equal(merged.critical, stored.critical);
  });

  it("names the field when a count is not a whole number", () => {
    const parsed = MetricRuleSchema.safeParse({ ...stored, checksInARow: 2.5 });
    assert.equal(parsed.success, false);
    assert.equal(wholeNumberError(parsed.error!), "Checks in a row must be a whole number");
    const calls = MetricRuleSchema.safeParse({ ...stored, minCalls: 2.5 });
    assert.equal(wholeNumberError(calls.error!), "Minimum LLM calls must be a whole number");
    const other = MetricRuleSchema.safeParse({ ...stored, metric: "nope" });
    assert.equal(wholeNumberError(other.error!), undefined);
  });
});
