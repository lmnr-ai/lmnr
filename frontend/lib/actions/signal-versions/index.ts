import { isDeepStrictEqual } from "node:util";

import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { signals, signalTriggers, signalVersions } from "@/lib/db/migrations/schema";

import { buildSignalDefinition, comparable, type SignalDefinition, type SignalVersion } from "./definition";

export {
  buildSignalDefinition,
  modeFromI16,
  type SignalDefinition,
  type SignalMode,
  type SignalVersion,
} from "./definition";

export const GetSignalVersionsSchema = z.object({
  projectId: z.guid(),
  signalId: z.guid(),
});

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Next version iff `definition` changed; `null` if not. Caller must already
 * hold `SELECT … FOR UPDATE` on the signals row.
 */
export const mintSignalVersion = async (
  tx: Transaction,
  projectId: string,
  signalId: string,
  definition: SignalDefinition
): Promise<number | null> => {
  const [latest] = await tx
    .select({
      version: signalVersions.version,
      definition: signalVersions.definition,
    })
    .from(signalVersions)
    .where(and(eq(signalVersions.projectId, projectId), eq(signalVersions.signalId, signalId)))
    .orderBy(desc(signalVersions.version))
    .limit(1);

  const latestDefinition = latest?.definition as SignalDefinition | undefined;
  if (latestDefinition && isDeepStrictEqual(comparable(latestDefinition), comparable(definition))) {
    return null;
  }

  const version = (latest?.version ?? 0) + 1;

  await tx.insert(signalVersions).values({
    projectId,
    signalId,
    version,
    definition,
  });

  return version;
};

/** Read the locked signal + newest trigger and mint if the snapshot changed. */
const mintSignalSnapshot = async (tx: Transaction, projectId: string, signalId: string): Promise<number | null> => {
  const [signal] = await tx
    .select({
      name: signals.name,
      prompt: signals.prompt,
      structuredOutputSchema: signals.structuredOutputSchema,
      metadata: signals.metadata,
      llmProfileId: signals.llmProfileId,
      llmModel: signals.llmModel,
    })
    .from(signals)
    .where(and(eq(signals.projectId, projectId), eq(signals.id, signalId)));

  if (!signal) return null;

  const [trigger] = await tx
    .select({
      value: signalTriggers.value,
      filters: signalTriggers.filters,
      mode: signalTriggers.mode,
    })
    .from(signalTriggers)
    .where(and(eq(signalTriggers.projectId, projectId), eq(signalTriggers.signalId, signalId)))
    .orderBy(desc(signalTriggers.createdAt), desc(signalTriggers.id))
    .limit(1);

  const metadata = (signal.metadata ?? {}) as { sampleRate?: number | null; disabled?: boolean };

  return mintSignalVersion(
    tx,
    projectId,
    signalId,
    buildSignalDefinition({
      name: signal.name,
      prompt: signal.prompt,
      structuredOutputSchema: signal.structuredOutputSchema as Record<string, unknown>,
      trigger: trigger?.value,
      filters: trigger?.filters,
      mode: trigger?.mode,
      sampleRate: metadata.sampleRate,
      disabled: metadata.disabled,
      llmProfileId: signal.llmProfileId,
      llmModel: signal.llmModel,
    })
  );
};

const bumpSignalVersion = async (
  tx: Transaction,
  projectId: string,
  signalId: string,
  version: number | null
): Promise<void> => {
  if (version === null) return;
  await tx
    .update(signals)
    .set({ version })
    .where(and(eq(signals.projectId, projectId), eq(signals.id, signalId)));
};

/** Trigger-only writes: re-read, mint, bump. Caller holds `FOR UPDATE`. */
export const mintSnapshotAndBump = async (tx: Transaction, projectId: string, signalId: string): Promise<void> => {
  const version = await mintSignalSnapshot(tx, projectId, signalId);
  await bumpSignalVersion(tx, projectId, signalId, version);
};

/** Oldest first. `project_id` is in the WHERE so a URL id can't leak another project's prompts. */
export const getSignalVersions = async (
  input: z.infer<typeof GetSignalVersionsSchema>
): Promise<{ items: SignalVersion[] }> => {
  const { projectId, signalId } = GetSignalVersionsSchema.parse(input);

  const rows = await db
    .select({
      version: signalVersions.version,
      definition: signalVersions.definition,
      createdAt: signalVersions.createdAt,
    })
    .from(signalVersions)
    .where(and(eq(signalVersions.projectId, projectId), eq(signalVersions.signalId, signalId)))
    .orderBy(asc(signalVersions.version));

  return {
    items: rows.map((row) => ({
      version: row.version,
      definition: row.definition as SignalDefinition,
      createdAt: row.createdAt,
    })),
  };
};
