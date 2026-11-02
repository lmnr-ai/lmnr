import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatNotification, type ReportNotification } from "@/components/notifications/notification-panel/utils";
import { type WebNotification } from "@/lib/actions/notifications";

const PROJECT = "p1";

const reportNotification = (report: Record<string, unknown>): WebNotification => ({
  id: "n1",
  projectId: PROJECT,
  workspaceId: "w1",
  definitionType: "REPORT",
  definitionId: "r1",
  payload: JSON.stringify({
    SignalsReport: {
      workspace_name: "WS",
      project_id: PROJECT,
      project_name: "proj",
      title: "Signals Report",
      period_label: "Daily",
      period_start: "2026-11-01T00:00:00Z",
      period_end: "2026-11-02T00:00:00Z",
      ai_summary: "legacy summary",
      noteworthy_events: [{ signal_name: "s", summary: "noteworthy", timestamp: "", trace_id: "t" }],
      ...report,
    },
  }),
  createdAt: "2026-11-02T00:00:00Z",
  isRead: false,
});

const format = (report: Record<string, unknown>) =>
  formatNotification(reportNotification(report)) as ReportNotification;

const cluster = (id: string, count: number, previous_count: number) => ({ id, name: id, count, previous_count });

describe("report notification formatting", () => {
  it("renders per-signal cards busiest first, with summary fallback and links", () => {
    const formatted = format({
      signal_event_counts: { Quiet: 2, Busy: 52 },
      signals: [
        { signal_id: "s-quiet", signal_name: "Quiet", current_count: 2, previous_count: 4, summary: "", clusters: [] },
        {
          signal_id: "s-busy",
          signal_name: "Busy",
          current_count: 52,
          previous_count: 40,
          summary: "Timeouts.",
          clusters: [],
        },
      ],
    });

    assert.equal(formatted.kind, "report");
    assert.deepEqual(
      formatted.signals.map((s) => [s.name, s.count, s.previousCount, s.summary, s.link]),
      [
        ["Busy", 52, 40, "Timeouts.", `/project/${PROJECT}/signals/s-busy`],
        ["Quiet", 2, 4, "2 events were detected during this period.", `/project/${PROJECT}/signals/s-quiet`],
      ]
    );
    assert.equal(formatted.summary, "2 signals · 54 events");
    assert.ok(!("noteworthyEvents" in formatted));
    assert.ok(!("aiSummary" in formatted));
  });

  it("selects notable clusters like the email and Slack reports", () => {
    const formatted = format({
      signal_event_counts: { S: 100 },
      signals: [
        {
          signal_id: "s",
          signal_name: "S",
          current_count: 100,
          previous_count: 50,
          summary: "x",
          clusters: [
            cluster("tiny", 2, 2), // below the 5-event threshold
            cluster("new-big", 40, 0),
            cluster("steady", 10, 10),
            cluster("spike", 30, 5),
            cluster("drop", 1, 20),
            cluster("a", 9, 6),
            cluster("b", 8, 6),
          ],
        },
      ],
    });

    const clusters = formatted.signals[0].clusters;
    // Recurring clusters ranked by change score, new ones last, capped at 5.
    assert.deepEqual(
      clusters.map((c) => c.name),
      ["spike", "drop", "a", "b", "steady"]
    );
    assert.equal(clusters[0].link, `/project/${PROJECT}/signals/s?clusterId=spike`);
  });

  it("falls back to per-signal totals for reports without signal data", () => {
    const formatted = format({ signal_event_counts: { A: 1, B: 7 } });
    assert.deepEqual(
      formatted.signals.map((s) => [s.name, s.count, s.link, s.clusters.length]),
      [
        ["B", 7, null, 0],
        ["A", 1, null, 0],
      ]
    );
  });
});
