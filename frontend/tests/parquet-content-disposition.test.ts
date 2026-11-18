import assert from "node:assert/strict";
import { it } from "node:test";

import { type GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { NextRequest } from "next/server";

import { GET } from "@/app/api/projects/[projectId]/datasets/[datasetId]/parquets/[idx]/route";
import { db } from "@/lib/db/drizzle";

it("streams Parquet files with plain, Unicode, and punctuation-containing attachment names", async (t) => {
  const cases = [
    ["part-0.parquet", "part-0.parquet", "part-0.parquet"],
    ["résumé-東京.parquet", "r_sum_-__.parquet", "r%C3%A9sum%C3%A9-%E6%9D%B1%E4%BA%AC.parquet"],
    ['report "Q1"; team\'s.parquet', "report _Q1__ team_s.parquet", "report%20%22Q1%22%3B%20team%27s.parquet"],
  ] as const;
  const projectId = "f5b899b7-d112-471b-835d-9eb1c0f6ecaa";
  const datasetId = "bd8e5ad8-cd62-4fc2-a09e-0160208d9026";

  const selectParquets = () => ({
    from: () => ({
      where: () => ({
        orderBy: async () =>
          cases.map(([filename]) => ({ parquetPath: `exports/${filename}`, projectId, datasetId, id: filename })),
      }),
    }),
  });
  t.mock.method(db, "select", selectParquets as unknown as typeof db.select);
  const send = async (command: GetObjectCommand | HeadObjectCommand) => {
    if (command instanceof HeadObjectCommand) {
      return { ContentType: "application/octet-stream", ContentLength: 4 };
    }
    return { Body: { transformToWebStream: () => new Response("PAR1").body } };
  };
  t.mock.method(S3Client.prototype, "send", send as typeof S3Client.prototype.send);

  for (const [index, [filename, fallback, encoded]] of cases.entries()) {
    const req = new NextRequest("http://localhost/api/parquet");
    const params = Promise.resolve({ projectId, datasetId, idx: String(index) });
    const response = await GET(req, { params });

    assert.equal(response.status, 200, filename);
    assert.equal(
      response.headers.get("Content-Disposition"),
      `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`,
      filename
    );
    assert.equal(await response.text(), "PAR1");
  }
});
