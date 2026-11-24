import assert from "node:assert/strict";
import { afterEach, it, mock } from "node:test";

import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { NextRequest } from "next/server";

import { GET } from "@/app/api/projects/[projectId]/datasets/[datasetId]/parquets/[idx]/route";
import { getParquets } from "@/lib/actions/dataset";
import { db } from "@/lib/db/drizzle";

const projectId = "f5b899b7-d112-471b-835d-9eb1c0f6ecaa";
const datasetId = "bd8e5ad8-cd62-4fc2-a09e-0160208d9026";
const parquetBytes = new TextEncoder().encode("PAR1");

const download = (idx: string) =>
  GET(new NextRequest("http://localhost/api/parquet"), { params: Promise.resolve({ projectId, datasetId, idx }) });

function mockParquets(paths: string[], unavailablePath?: string) {
  const selectParquets = () => ({
    from: () => ({
      where: () => ({
        orderBy: async () => paths.map((parquetPath) => ({ parquetPath, projectId, datasetId, id: parquetPath })),
      }),
    }),
  });
  const select = mock.method(db, "select", selectParquets as unknown as typeof db.select);
  const send = async (command: GetObjectCommand | HeadObjectCommand) => {
    if (command instanceof HeadObjectCommand) {
      if (command.input.Key === unavailablePath) throw new Error("Metadata temporarily unavailable");
      return { ContentType: "application/octet-stream", ContentLength: parquetBytes.length };
    }

    return {
      Body: {
        transformToWebStream: () => new Response(parquetBytes).body,
      },
    };
  };
  const storage = mock.method(S3Client.prototype, "send", send as typeof S3Client.prototype.send);
  return { select, storage };
}

afterEach(() => mock.restoreAll());

it("rejects a malformed Parquet index before looking up files", async () => {
  const { select, storage } = mockParquets(["exports/part-0.parquet"]);

  for (const idx of ["0tail", "0.5", "-1", "9007199254740992", "0\n"]) {
    assert.equal((await download(idx)).status, 400, JSON.stringify(idx));
  }

  assert.equal(select.mock.callCount(), 0);
  assert.equal(storage.mock.callCount(), 0);
});

it("returns 404 when a requested file index is no longer available", async () => {
  const { storage } = mockParquets(["exports/part-0.parquet"]);
  const response = await download("1");

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Parquet file not found" });
  assert.equal(
    storage.mock.calls.some(({ arguments: [command] }) => command instanceof GetObjectCommand),
    false
  );
});

it("does not serve a different file when an earlier metadata lookup fails", async () => {
  const { storage } = mockParquets(["exports/part-0.parquet", "exports/part-1.parquet"], "exports/part-0.parquet");

  await assert.rejects(getParquets(projectId, datasetId), /Metadata temporarily unavailable/);
  assert.equal((await download("0")).status, 500);
  assert.equal(
    storage.mock.calls.some(({ arguments: [command] }) => command instanceof GetObjectCommand),
    false
  );
});

it("streams a valid file with its size", async () => {
  const { storage } = mockParquets(["exports/part-0.parquet"]);
  const response = await download("0");

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "application/octet-stream");
  assert.equal(response.headers.get("Content-Length"), String(parquetBytes.length));
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), parquetBytes);
  assert.equal(storage.mock.calls.filter(({ arguments: [command] }) => command instanceof GetObjectCommand).length, 1);
});
