import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type Filter } from "@/lib/actions/common/filters";
import { Operator } from "@/lib/actions/common/operators";
import { type QueryParams } from "@/lib/actions/common/query-builder";
import { buildDatapointCountQueryWithParams, buildDatapointsQueryWithParams } from "@/lib/actions/datapoints/utils";
import { buildEvalQuery, buildEvalStatsQuery } from "@/lib/actions/evaluation/query-builder";
import {
  buildTracesCountQueryWithParams,
  buildTracesIdsQueryWithParams,
  buildTracesQueryWithParams,
  buildTracesStatsWhereConditions,
} from "@/lib/actions/traces/utils";

type FilterResult = { query: string; parameters: QueryParams };
type Case = {
  name: string;
  run: (value: string) => FilterResult;
  keyParam: string;
  valParam: string;
  sql: string;
};

const datapointCases: Case[] = ["metadata", "data", "target"].flatMap((column) => [
  {
    name: `datapoints list ${column}`,
    run: (value) =>
      buildDatapointsQueryWithParams({
        pageSize: 20,
        offset: 0,
        filters: [{ column, operator: Operator.Eq, value }],
      }),
    keyParam: `${column}_0_key`,
    valParam: `${column}_0_val`,
    sql: `simpleJSONExtractString(dataset_datapoints.${column}, {${column}_0_key:String})`,
  },
  {
    name: `datapoints count ${column}`,
    run: (value) => buildDatapointCountQueryWithParams({ filters: [{ column, operator: Operator.Eq, value }] }),
    keyParam: `${column}_0_key`,
    valParam: `${column}_0_val`,
    sql: `simpleJSONExtractString(dataset_datapoints.${column}, {${column}_0_key:String})`,
  },
]);

const traceFilter = (value: string): Filter[] => [{ column: "metadata", operator: Operator.Eq, value }];
const traceBase = { traceType: "DEFAULT" as const, traceIds: [] as string[] };
const traceCases: Case[] = [
  {
    name: "traces list",
    run: (value: string) =>
      buildTracesQueryWithParams({
        ...traceBase,
        projectId: "project",
        filters: traceFilter(value),
        limit: 20,
        offset: 0,
      }),
  },
  {
    name: "traces count",
    run: (value: string) =>
      buildTracesCountQueryWithParams({ ...traceBase, projectId: "project", filters: traceFilter(value) }),
  },
  {
    name: "traces ids",
    run: (value: string) => buildTracesIdsQueryWithParams({ ...traceBase, filters: traceFilter(value) }),
  },
  {
    name: "traces stats",
    run: (value: string) => {
      const { conditions, params } = buildTracesStatsWhereConditions({ ...traceBase, filters: traceFilter(value) });
      return { query: conditions.join(" AND "), parameters: params };
    },
  },
].map((testCase) => ({
  ...testCase,
  keyParam: "metadata_0_key",
  valParam: "metadata_0_val",
  sql: "simpleJSONExtractString(metadata, {metadata_0_key:String})",
}));

const evalColumns = [
  { id: "metadata", sql: "metadata", filterSql: "simpleJSONExtractString(metadata, {KEY:String}) = {VAL:String}" },
];
const evalFilter = (value: string) => [{ column: "metadata", operator: Operator.Eq, value }];
const evalBase = { evaluationId: "evaluation", columns: evalColumns, traceIds: [] as string[] };
const evalCases: Case[] = [
  {
    name: "evaluation list",
    run: (value) => buildEvalQuery({ ...evalBase, filters: evalFilter(value), limit: 20, offset: 0 }),
    keyParam: "f_metadata_0_key",
    valParam: "f_metadata_0_val",
    sql: "simpleJSONExtractString(metadata, {f_metadata_0_key:String})",
  },
  {
    name: "evaluation comparison",
    run: (value) =>
      buildEvalQuery({ ...evalBase, filters: evalFilter(value), limit: 20, offset: 0, targetId: "target" }),
    keyParam: "p_f_metadata_0_key",
    valParam: "p_f_metadata_0_val",
    sql: "simpleJSONExtractString(metadata, {p_f_metadata_0_key:String})",
  },
  {
    name: "evaluation stats",
    run: (value) => buildEvalStatsQuery({ ...evalBase, filters: evalFilter(value) }),
    keyParam: "sf_metadata_0_key",
    valParam: "sf_metadata_0_val",
    sql: "simpleJSONExtractString(metadata, {sf_metadata_0_key:String})",
  },
];

const cases = [...datapointCases, ...traceCases, ...evalCases];
const values = [
  ["token=ab==", "token", "ab=="],
  ["url=https://example.com/?a=1&b=2", "url", "https://example.com/?a=1&b=2"],
  ["emoji==🚀=α", "emoji", "=🚀=α"],
] as const;

describe("JSON key=value filters preserve equals in values", () => {
  for (const testCase of cases) {
    for (const [input, key, value] of values) {
      it(`${testCase.name}: ${input}`, () => {
        const { query, parameters } = testCase.run(input);
        assert.ok(query.includes(testCase.sql));
        assert.ok(query.includes(`{${testCase.valParam}:String}`));
        assert.ok(!query.includes(input));
        assert.equal(parameters[testCase.keyParam], key);
        assert.equal(parameters[testCase.valParam], value);
        if (!testCase.name.startsWith("evaluation")) {
          assert.ok(query.includes("simpleJSONExtractRaw"));
        }
        if (testCase.name === "evaluation comparison") {
          assert.equal(parameters.c_f_metadata_0_val, value);
          assert.ok(query.includes("{c_f_metadata_0_val:String}"));
        }
      });
    }

    it(`${testCase.name}: ordinary and malformed values`, () => {
      const ordinary = testCase.run("status=active");
      assert.ok(ordinary.query.includes(testCase.sql));
      assert.equal(ordinary.parameters[testCase.keyParam], "status");
      assert.equal(ordinary.parameters[testCase.valParam], "active");

      for (const malformed of ["status", "=active", "status="]) {
        const result = testCase.run(malformed);
        assert.ok(!result.query.includes(testCase.sql));
        assert.ok(!(testCase.keyParam in result.parameters));
        assert.ok(!(testCase.valParam in result.parameters));
      }
    });
  }
});
