import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildConditionSummary,
  summaryToText,
} from "@/components/signals/create-signal-drawer/triggers-section/build-condition-summary";
import { getRootSpanFinishedCondition, getSpanNameCondition } from "@/components/signals/trigger-filter-field";
import { Operator } from "@/lib/actions/common/operators";

describe("buildConditionSummary", () => {
  it("describes the default root-span trigger and token filter", () => {
    const text = summaryToText(
      buildConditionSummary(
        [getRootSpanFinishedCondition()],
        [{ column: "total_token_count", operator: Operator.Gt, value: 1000 }]
      )!
    );
    assert.equal(text, "This signal will run when the trace finishes, if the trace has more than 1,000 tokens.");
  });

  it("uses OR for multiple trigger span names", () => {
    const text = summaryToText(buildConditionSummary([getSpanNameCondition(["get_full_spans", "Task Judge"])], [])!);
    assert.equal(text, "This signal will run when any of the spans get_full_spans or Task Judge finishes.");
  });

  it("distinguishes a span trigger from a span-names filter on the same trace", () => {
    const text = summaryToText(
      buildConditionSummary(
        [getSpanNameCondition(["get_full_spans"])],
        [{ column: "span_names", operator: Operator.Includes, value: ["search_flights"] }]
      )!
    );
    assert.equal(text, "This signal will run when get_full_spans finishes, if the trace includes search_flights.");
  });

  it("ANDs filters and ORs names inside a span-names filter", () => {
    const text = summaryToText(
      buildConditionSummary(
        [getRootSpanFinishedCondition()],
        [
          { column: "span_names", operator: Operator.Includes, value: ["a", "b"] },
          { column: "status", operator: Operator.Eq, value: "error" },
        ]
      )!
    );
    assert.equal(
      text,
      "This signal will run when the trace finishes, if the trace includes a or b and has an error status."
    );
  });

  it("returns null when a span-name trigger has no names yet", () => {
    assert.equal(buildConditionSummary([getSpanNameCondition([])], []), null);
  });
});
