import { and, eq } from 'drizzle-orm';
import { z } from 'zod/v4';

import { encodeApiKey } from '@/lib/crypto';
import { db } from '@/lib/db/drizzle';
import { providerApiKeys } from '@/lib/db/migrations/schema';

const CreateProviderApiKeySchema = z.object({
  projectId: z.string(),
  name: z.string(),
  value: z.string(),
});

const GetProviderApiKeysSchema = z.object({
  projectId: z.string(),
});

const DeleteProviderApiKeySchema = z.object({
  projectId: z.string(),
  name: z.string(),
});

export async function createProviderApiKey(
  input: z.infer<typeof CreateProviderApiKeySchema>
): Promise<void> {
  const { projectId, name, value } = CreateProviderApiKeySchema.parse(input);

  const { value: encryptedValue, nonce } = await encodeApiKey(name, value);

  await db.insert(providerApiKeys).values({
    projectId,
    name,
    nonceHex: nonce,
    value: encryptedValue,
  });
}

export async function getProviderApiKeys(
  input: z.infer<typeof GetProviderApiKeysSchema>
): Promise<Array<{ name: string; createdAt: string | null }>> {
  const { projectId } = GetProviderApiKeysSchema.parse(input);

  const res = await db
    .select({
      name: providerApiKeys.name,
      createdAt: providerApiKeys.createdAt,
    })
    .from(providerApiKeys)
    .where(eq(providerApiKeys.projectId, projectId));

  return res;
}

export async function deleteProviderApiKey(
  input: z.infer<typeof DeleteProviderApiKeySchema>
): Promise<void> {
  const { projectId, name } = DeleteProviderApiKeySchema.parse(input);

  const res = await db
    .delete(providerApiKeys)
    .where(and(eq(providerApiKeys.name, name), eq(providerApiKeys.projectId, projectId)))
    .returning();

  if (res.length !== 1) {
    throw new Error('Provider API key not found');
  }
}
