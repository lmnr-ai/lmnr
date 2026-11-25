import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatNotification, severityOf } from "@/components/notifications/notification-panel/utils";
import { type WebNotification } from "@/lib/actions/notifications";

// The payload the app-server stores for `NotificationKind::MetricAlert`.
const payload = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    MetricAlert: {
      project_id: "p",
      project_name: "prod",
      alert_id: "a",
      alert_name: "Cost spike",
      incident_id: "i",
      transition: "escalated",
      level: "critical",
      group: null,
      headline: "Escalated to Critical",
      summary: "Total cost over the last hour is $3.10. That is above the critical threshold of $2.80.",
      details: [{ label: "Value", value: "$3.10" }],
      traces_path: "/project/p/traces?sortBy=cost&sortDirection=desc",
      alert_path: "/project/p/settings/alerts/a",
      checked_at: "Nov 25, 2026 at 7:35 PM UTC",
      ...overrides,
    },
  });

const notification = (payload: string): WebNotification => ({
  id: "n",
  projectId: "p",
  workspaceId: "w",
  definitionType: "ALERT",
  definitionId: "a",
  payload,
  createdAt: "2026-11-25T19:35:00.000Z",
  isRead: false,
});

describe("metric alert notifications in the panel", () => {
  it("shows the transition, the measured sentence and both links", () => {
    const formatted = formatNotification(notification(payload()));

    assert.deepEqual(formatted, {
      kind: "metric",
      title: "Cost spike",
      summary: "Escalated to Critical",
      severity: 2,
      description: "Total cost over the last hour is $3.10. That is above the critical threshold of $2.80.",
      tracesLink: "/project/p/traces?sortBy=cost&sortDirection=desc",
      alertLink: "/project/p/settings/alerts/a",
    });
  });

  it("names the model of a split rule and counts a resolved incident as info", () => {
    const formatted = formatNotification(
      notification(payload({ group: "gpt-4o", level: "ok", transition: "resolved", headline: "Resolved" }))
    );

    assert.ok(formatted);
    assert.equal(formatted.title, "Cost spike (gpt-4o)");
    assert.equal(severityOf(formatted), 0);
  });
});
