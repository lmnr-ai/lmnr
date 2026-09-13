import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Operator } from "@/lib/actions/common/operators";
import { buildEventsQueryWithParams } from "@/lib/actions/events/utils";

describe("payload JSON string filters", () => {
  it("joins extractString/extractRaw with AND for != (OR would match every quoted JSON string)", () => {
    const { query } = buildEventsQueryWithParams({
      signalId: "00000000-0000-0000-0000-000000000001",
      filters: [
        {
          column: "payload.status",
          operator: Operator.Eq,
          value: "error",
          dataType: "string",
        },
        {
          column: "payload.category",
          operator: Operator.Ne,
          value: "timeout",
          dataType: "string",
        },
      ],
      limit: 50,
      offset: 0,
      pastHours: "72",
    });

    assert.match(
      query,
      /simpleJSONExtractString\(payload, \{payload_status_0_key:String\}\) = \{payload_status_0_val:String\} OR simpleJSONExtractRaw/
    );
    assert.match(
      query,
      /simpleJSONExtractString\(payload, \{payload_category_1_key:String\}\) != \{payload_category_1_val:String\} AND simpleJSONExtractRaw/
    );
  });
});
