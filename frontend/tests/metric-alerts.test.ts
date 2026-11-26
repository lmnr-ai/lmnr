import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseAsArrayOf, parseAsString } from "nuqs/server";

import { chartAlertPreset } from "@/components/dashboards/chart-alert";
import { CHART_PRESETS } from "@/components/dashboards/chart-presets";
import { incidentTracesHref, tracesHref } from "@/components/settings/alerts/metric-alert-page/traces-href";
import {
  DEFAULT_FORM_VALUES,
  fromRule,
  thresholdsLine,
  toRule,
} from "@/components/settings/alerts/metric-alerts/metric-alert-sheet/form-rule";
import {
  niceCeil,
  probeRule,
  suggestionFor,
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
import { mergeRulePatch, type MetricRule, MetricRuleSchema, wholeNumberError } from "@/lib/actions/alerts/metric-rule";
import { METRIC_ALERT_TEMPLATES, TEMPLATE_CATEGORIES } from "@/lib/actions/alerts/metric-templates";
import { Operator } from "@/lib/actions/common/operators";
import defaultCharts from "@/lib/db/default-charts";

const form = (values: Partial<MetricAlertFormValues>): MetricAlertFormValues => ({ ...DEFAULT_FORM_VALUES, ...values });
const rule = (values: Partial<MetricAlertFormValues>): MetricRule => MetricRuleSchema.parse(toRule(form(values)));
const formTemplate = (id: string) => TEMPLATES.find((t) => t.id === id)!;
const template = (id: string) => formTemplate(id).values;
const spendingLimit = (values: Partial<MetricAlertFormValues> = {}) =>
  rule({ ...template("daily-spending-limit"), spendingLimit: "50", ...values });
/** One preview point per entry: `[day of the month, hour, value]`. */
const points = (...entries: [number, number, number | null][]) =>
  entries.map(([day, hour, value]) => ({ at: new Date(Date.UTC(2026, 0, day, hour)).toISOString(), value }));

describe("metric alert templates", () => {
  it("offers ten templates, each in one of the four categories", () => {
    assert.deepEqual(
      TEMPLATE_CATEGORIES.map((category) =>
        METRIC_ALERT_TEMPLATES.filter((t) => t.category === category).map((t) => t.id)
      ),
      [
        ["error-spike", "cost-spike", "error-rate"],
        ["traffic-stopped", "cost-tracking-stopped", "token-usage-missing"],
        ["daily-spending-limit", "expensive-trace"],
        ["unusually-expensive-trace", "cost-vs-last-week"],
      ]
    );
  });

  it("turns every template into a rule and back without losing a field", () => {
    for (const { id, values } of TEMPLATES) {
      // Templates whose number depends on the project leave it to the user.
      const filled = form({
        ...values,
        ...(values.conditionType === "spending_limit" && { spendingLimit: "50" }),
        ...(values.warning === "" && values.conditionType !== "spending_limit" && { warning: "5" }),
      });
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
    assert.deepEqual(suggestValues(formTemplate("cost-spike"), 2.6), { warning: "4", critical: "8" });
    assert.deepEqual(suggestValues(formTemplate("daily-spending-limit"), 30), { spendingLimit: "50" });
    // A quiet project keeps the template's own thresholds as a floor.
    assert.deepEqual(suggestValues(formTemplate("error-spike"), 1), { warning: "5", critical: "25" });
    assert.deepEqual(suggestValues(formTemplate("error-spike"), 40), { warning: "60", critical: "120" });
  });

  it("suggests nothing without data or for a template with fixed thresholds", () => {
    assert.equal(suggestValues(formTemplate("cost-spike"), null), null);
    assert.equal(suggestValues(formTemplate("error-rate"), 12), null);
  });

  it("reads a template's series with a rule that can be saved and never fires", () => {
    for (const probed of TEMPLATES.filter((t) => t.suggest)) {
      const parsed = MetricRuleSchema.safeParse(probeRule(probed));
      assert.ok(parsed.success, probed.id);
    }
    assert.equal(probeRule(formTemplate("error-spike")).warning, 1e15);
    assert.equal(probeRule(formTemplate("error-spike")).critical, null);
  });

  it("drops the suggestion once the form no longer describes the template", () => {
    const picked = formTemplate("cost-spike");
    const suggestions = { "cost-spike": { warning: "4", critical: "8" } };
    assert.deepEqual(suggestionFor(picked, form(picked.values), suggestions), suggestions["cost-spike"]);
    assert.equal(suggestionFor(picked, form({ ...picked.values, window: "15" }), suggestions), undefined);
    assert.equal(suggestionFor(picked, form({ ...picked.values, metric: "total_tokens" }), suggestions), undefined);
    assert.equal(suggestionFor(undefined, form(picked.values), suggestions), undefined);
  });

  it("names the thresholds a template would set", () => {
    assert.equal(thresholdsLine(form(template("error-rate"))), "Warning above 5% · Critical above 20%");
    assert.equal(thresholdsLine(form(template("traffic-stopped"))), "Warning below 1");
    assert.equal(thresholdsLine(form(template("cost-spike"))), null);
    assert.equal(
      thresholdsLine(form({ ...template("daily-spending-limit"), spendingLimit: "50" })),
      "Limit $50.00 · Warn at 80%"
    );
  });
});

describe("metric alert form", () => {
  it("writes the rule JSON the engine reads", () => {
    assert.deepEqual(toRule(form({ ...template("cost-vs-last-week"), splitByModel: true })), {
      metric: "total_cost",
      filters: [],
      groupBy: "model",
      window: { minutes: 60 },
      condition: { type: "change", compareTo: "1w" },
      direction: "above",
      warning: 130,
      critical: 150,
      // Left out, so the engine resolves at the warning threshold.
      resolve: null,
      minChange: 1,
      checksInARow: 3,
      minTraces: 50,
      onNoData: null,
    });
  });

  it("stores a spending limit without thresholds, over a day or the month, never split", () => {
    const daily = toRule(
      form({ ...template("daily-spending-limit"), spendingLimit: "50", resolve: "10", splitByModel: true })
    );
    assert.deepEqual(daily.condition, { type: "spending_limit", limit: 50, warnAtPercent: 80 });
    assert.deepEqual(daily.window, { minutes: 1440 });
    assert.equal(daily.warning, null);
    assert.equal(daily.critical, null);
    assert.equal(daily.resolve, null);
    assert.equal(daily.groupBy, null);

    const monthly = toRule(
      form({ ...template("daily-spending-limit"), spendingLimit: "2000", warnAtPercent: "90", window: "mtd" })
    );
    assert.deepEqual(monthly.condition, { type: "spending_limit", limit: 2000, warnAtPercent: 90 });
    assert.deepEqual(monthly.window, { monthToDate: true });
  });

  it("keeps a resolve threshold the user typed", () => {
    assert.equal(toRule(form({ ...template("error-rate"), resolve: "3" })).resolve, 3);
    assert.equal(toRule(form(template("error-rate"))).resolve, null);
  });

  it("leaves an empty threshold out instead of storing zero", () => {
    const stopped = toRule(form(template("traffic-stopped")));
    assert.equal(stopped.warning, 1);
    assert.equal(stopped.critical, null);
  });

  it("accepts the new metrics, the 30 minute window and the 30 minutes earlier comparison", () => {
    for (const metric of ["error_traces", "no_cost_rate", "no_tokens_rate"] as const) {
      const parsed = rule({ metric, window: "30", conditionType: "change", compareTo: "30m", warning: "150" });
      assert.equal(parsed.metric, metric);
      assert.deepEqual(parsed.window, { minutes: 30 });
      assert.deepEqual(parsed.condition, { type: "change", compareTo: "30m" });
    }
  });
});

describe("metric alert summaries", () => {
  it("describes each kind of condition in one line", () => {
    assert.equal(
      conditionSummary(rule(template("cost-vs-last-week"))),
      "Total cost over 1 hour above 130% of 1 week earlier"
    );
    assert.equal(conditionSummary(spendingLimit()), "Spending limit of $50.00 over the last day");
    assert.equal(conditionSummary(spendingLimit({ window: "mtd" })), "Spending limit of $50.00 this month");
    assert.equal(conditionSummary(rule(template("error-rate"))), "Error rate over 15 minutes above 5%");
    assert.equal(conditionSummary(rule(template("error-spike"))), "Errored traces over 15 minutes above 5");
    assert.equal(
      conditionSummary(rule({ ...template("cost-vs-last-week"), splitByModel: true })),
      "Total cost over 1 hour above 130% of 1 week earlier · by model"
    );
  });

  it("reads a rule back as an 'Alerts when' sentence", () => {
    assert.equal(
      alertsWhen(toRule(form({ ...template("cost-spike"), warning: "5", critical: "10" }))),
      "Alerts when total cost over the last hour is above $5.00 (warning) or $10.00 (critical)."
    );
    assert.equal(
      alertsWhen(toRule(form(template("traffic-stopped")))),
      "Alerts when trace count over the last 15 minutes is below 1 (warning)."
    );
    assert.equal(
      alertsWhen(toRule(form(template("cost-vs-last-week")))),
      "Alerts when total cost over the last hour is above 130% (warning) or 150% (critical) of the same window 1 week earlier."
    );
    assert.equal(
      alertsWhen(toRule(form(template("unusually-expensive-trace")))),
      "Alerts when a single trace costs more than 300% (warning) or 1,000% (critical) of this project's usual p99 trace cost."
    );
    assert.equal(
      alertsWhen(toRule(form({ ...template("expensive-trace"), critical: "2" }))),
      "Alerts when a trace from the last 15 minutes costs more than $2.00 (critical)."
    );
    assert.equal(
      alertsWhen(spendingLimit()),
      "Alerts when spend over the last day reaches $40.00 (warning, 80% of the limit) and $50.00 (critical)."
    );
    assert.equal(
      alertsWhen(spendingLimit({ window: "mtd", spendingLimit: "2000", warnAtPercent: "90" })),
      "Alerts when spend this month reaches $1,800 (warning, 90% of the limit) and $2,000 (critical)."
    );
  });

  it("has no sentence until a threshold is set", () => {
    assert.equal(alertsWhen(toRule(form(template("cost-spike")))), null);
    assert.equal(alertsWhen(toRule(form(template("daily-spending-limit")))), null);
  });

  it("draws a spending limit as a limit line and a warn line", () => {
    assert.deepEqual(thresholdLines(spendingLimit()), [
      { key: "critical", value: 50, label: "Limit $50.00" },
      { key: "warning", value: 40, label: "Warn at $40.00" },
    ]);
    assert.deepEqual(
      thresholdLines(rule(template("error-rate"))).map((line) => line.label),
      ["Critical 20%", "Warning 5%"]
    );
  });

  it("calls a level by its name and a muted rule 'Muted'", () => {
    const limit = spendingLimit();
    assert.deepEqual(alertStatus({ rule: limit, level: "warning" }), { label: "Warning", tone: "warning" });
    assert.deepEqual(alertStatus({ rule: limit, level: "critical" }), { label: "Critical", tone: "critical" });
    assert.deepEqual(alertStatus({ rule: { ...limit, disabled: true }, level: "critical" }), {
      label: "Muted",
      tone: "muted",
    });
    assert.deepEqual(alertStatus({ rule: rule(template("error-rate")), level: "ok" }), { label: "OK", tone: "ok" });
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

const monthly = spendingLimit({ window: "mtd", spendingLimit: "2000" });

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

  it("leaves the filter out for a rule without filters", () => {
    const href = tracesHref("p1", monthly, new Date("2026-01-01T10:00:00Z"), new Date("2026-01-01T11:00:00Z"));
    const url = new URL(href, "http://localhost");
    assert.equal(url.searchParams.has("filter"), false);
    assert.equal(url.searchParams.get("sortBy"), "cost");
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

  it("starts a month-to-date incident's range at the start of the UTC month", () => {
    const incident = { openedAt: "2026-01-20 12:00:00+00", resolvedAt: null };
    const now = new Date("2026-01-21T00:00:00Z");
    // The month start does not depend on how often the rule is checked.
    const url = new URL(incidentTracesHref("p1", monthly, incident, undefined, now)!, "http://x");
    assert.equal(url.searchParams.get("startDate"), "2026-01-01T00:00:00.000Z");
    assert.equal(url.searchParams.get("endDate"), "2026-01-21T00:00:00.000Z");
  });
});

describe("metric rule patches", () => {
  const stored = monthly;

  it("changes a spending limit and keeps its type", () => {
    const merged = MetricRuleSchema.parse(mergeRulePatch(stored, { condition: { limit: 3000 } }));
    assert.deepEqual(merged.condition, { type: "spending_limit", limit: 3000, warnAtPercent: 80 });
    assert.deepEqual({ ...merged, condition: stored.condition }, stored);
  });

  it("drops the old condition's fields when the type changes", () => {
    const change = rule(template("cost-vs-last-week"));
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
