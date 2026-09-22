import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import { NextRequest } from "next/server";

import { POST } from "@/app/api/projects/[projectId]/datasets/[datasetId]/file-upload/route";
import { clickhouseClient } from "@/lib/clickhouse/client";

const projectId = "11111111-1111-4111-8111-111111111111";
const datasetId = "22222222-2222-4222-8222-222222222222";
const targets = [false, 0, "", true, 42, "text", { answer: false }, [false, 0, ""], null];
const records = [...targets.map((target, data) => ({ data, target })), { data: targets.length }];

async function assertUploadedTargets(t: TestContext, filename: string, content: string, expectedTargets: unknown[]) {
  const insert = t.mock.method(clickhouseClient, "insert", async () => ({ query_id: "test", executed: true }));
  const formData = new FormData();
  formData.set("file", new File([content], filename));

  const response = await POST(
    new NextRequest(`http://localhost/api/projects/${projectId}/datasets/${datasetId}/file-upload`, {
      method: "POST",
      body: formData,
    }),
    { params: Promise.resolve({ projectId, datasetId }) }
  );

  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.deepEqual(body, {
    success: true,
    message: `Successfully uploaded ${expectedTargets.length} datapoints`,
    count: expectedTargets.length,
  });
  assert.equal(insert.mock.callCount(), 1);

  const insertParams = insert.mock.calls[0].arguments[0];
  assert.ok(insertParams);
  const { table, values } = insertParams;
  assert.equal(table, "dataset_datapoints");
  assert.ok(Array.isArray(values));
  assert.deepEqual(
    values.map(({ project_id, dataset_id, data, target, metadata }) => ({
      project_id,
      dataset_id,
      data,
      target,
      metadata,
    })),
    expectedTargets.map((target, index) => ({
      project_id: projectId,
      dataset_id: datasetId,
      data: JSON.stringify(index),
      target: JSON.stringify(target),
      metadata: "{}",
    }))
  );
}

test("JSON uploads preserve falsy targets and only default missing or null targets", async (t) => {
  await assertUploadedTargets(t, "dataset.json", JSON.stringify(records), [...targets.slice(0, -1), {}, {}]);
});

test("JSONL uploads preserve falsy targets and only default missing or null targets", async (t) => {
  await assertUploadedTargets(t, "dataset.jsonl", records.map((record) => JSON.stringify(record)).join("\n"), [
    ...targets.slice(0, -1),
    {},
    {},
  ]);
});

test("CSV uploads preserve parsed falsy targets and blank fields, and default null targets", async (t) => {
  const csv = [
    "data,target",
    "0,false",
    "1,0",
    "2,",
    "3,true",
    "4,42",
    "5,text",
    '6,"{""answer"":false}"',
    '7,"[false,0,""""]"',
    "8,null",
    '9,""""""',
  ].join("\n");

  await assertUploadedTargets(t, "dataset.csv", csv, [...targets.slice(0, -1), {}, ""]);
});

test("CSV uploads without a target column retain the empty-object default", async (t) => {
  await assertUploadedTargets(t, "dataset.csv", "data,metadata\n0,{}", [{}]);
});
