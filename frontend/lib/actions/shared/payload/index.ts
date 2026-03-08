import { z } from "zod/v4";

export const GetSharedPayloadSchema = z.object({
  payloadId: z.string(),
  payloadType: z.string().nullable(),
});

export const getSharedPayload = async (input: z.infer<typeof GetSharedPayloadSchema>) => {
  GetSharedPayloadSchema.parse(input);

  throw new Error("Shared payloads are no longer stored in S3");
};
