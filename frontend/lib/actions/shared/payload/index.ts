import { eq } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { sharedPayloads } from "@/lib/db/migrations/schema";
import { downloadS3ObjectHttp } from "@/lib/s3";

export const GetSharedPayloadSchema = z.object({
  payloadId: z.string(),
  payloadType: z.string().nullable(),
});

export const getSharedPayload = async (input: z.infer<typeof GetSharedPayloadSchema>) => {
  const { payloadId, payloadType } = GetSharedPayloadSchema.parse(input);

  const result = await db.query.sharedPayloads.findFirst({
    where: eq(sharedPayloads.payloadId, payloadId),
    columns: {
      projectId: true,
    },
  });

  if (!result) {
    throw new Error("Shared Payload Not Found");
  }

  const { bytes, headers } = await downloadS3ObjectHttp(result.projectId, payloadId, payloadType);

  return { bytes, headers };
};
