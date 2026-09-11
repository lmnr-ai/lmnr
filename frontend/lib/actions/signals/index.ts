import { and, asc, desc, eq, gte, ilike, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod/v4";

import signalTemplates from "@/components/signals/prompts";
import { SEVERITY_LEVEL } from "@/lib/actions/alerts/types";
import { type Filter, FilterSchema, parseFilters } from "@/lib/actions/common/filters";
import { PaginationFiltersSchema, SortSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { buildSignalDefinition, mintSignalVersion } from "@/lib/actions/signal-versions";
import { executeQuery } from "@/lib/actions/sql";
import { cache, SIGNAL_TRIGGERS_CACHE_KEY } from "@/lib/cache.ts";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { getTimeRange } from "@/lib/clickhouse/utils";
import { DEFAULT_SIGNAL_TRIGGER_FILTERS, DEFAULT_SIGNAL_TRIGGER_VALUE } from "@/lib/db/default-signals.ts";
import { db } from "@/lib/db/drizzle";
import {
  alerts,
  alertTargets,
  llmProfileModels,
  llmProfiles,
  projects,
  signals,
  signalTriggers,
} from "@/lib/db/migrations/schema";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

// User-controlled signal settings stored in the `metadata` jsonb column.
// `disabled` is only persisted when true; absence means enabled (active).
export type SignalMetadata = {
  sampleRate?: number | null;
  disabled?: boolean;
};

export type SignalRow = {
  id: string;
  name: string;
  prompt: string;
  createdAt: string;
  projectId: string;
  disabled: boolean;
  version: number;
  eventsCount: number;
  clustersCount: number;
  lastEventAt: string | null;
  runsCount: number;
  // Populated by the private signal-versioning implementation when available.
  versionsCount: number | null;
};

export type Signal = {
  id: string;
  name: string;
  createdAt: string;
  projectId: string;
  prompt: string;
  structuredOutput: Record<string, unknown>;
  sampleRate: number | null;
  disabled: boolean;
  /** Both null = run on the server's env-configured LLM (legacy / cloud). */
  llmProfileId: string | null;
  llmModel: string | null;
};

// Optional, not nullable: absent means "keep the stored route", and no client sends null.
const LlmProfileFieldsSchema = {
  llmProfileId: z.guid().optional(),
  llmModel: z.string().trim().min(1).max(256).optional(),
};

/** Mirrors `signals_llm_profile_pair_check`: a signal pins both a profile and a model, or neither. */
const llmRouteIsPaired = (v: { llmProfileId?: string; llmModel?: string }) =>
  (v.llmProfileId === undefined) === (v.llmModel === undefined);

/** Cloud runs signals on Laminar's own keys, so no route may be pinned there. */
const llmRouteIsAllowed = (v: { llmProfileId?: string }) =>
  v.llmProfileId === undefined || isFeatureEnabled(Feature.SIGNAL_LLM_PROFILES);

const LLM_PROFILE_PAIR_ERROR = { message: "Select both an LLM profile and a model", path: ["llmModel"] };
const LLM_PROFILE_CLOUD_ERROR = {
  message: "Signals run on Laminar's own keys on Laminar Cloud",
  path: ["llmProfileId"],
};

export const GetSignalsSchema = PaginationFiltersSchema.extend({
  ...TimeRangeSchema.shape,
  ...SortSchema.shape,
  projectId: z.guid(),
  search: z.string().nullable().optional(),
});

const GetSignalSchema = z.object({
  projectId: z.guid(),
  id: z.guid(),
});

const TriggerInputSchema = z.object({
  id: z.guid().optional(),
  conditions: z.array(FilterSchema).min(1, "A trigger must have at least one condition"),
  filters: z.array(FilterSchema).default([]),
  mode: z.number().int().min(0).max(1).default(0),
});

type TriggerInput = z.infer<typeof TriggerInputSchema>;

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const CreateSignalSchema = z
  .object({
    projectId: z.guid(),
    name: z.string().min(1, "Name is required").max(255, { error: "Name must be less than 255 characters" }),
    prompt: z.string(),
    structuredOutput: z.record(z.string(), z.unknown()),
    sampleRate: z.number().int().min(1).max(95).nullable().optional(),
    disabled: z.boolean().optional(),
    triggers: z.array(TriggerInputSchema).optional(),
    // When provided, the creator is auto-subscribed via EMAIL alert targets on
    // every alert created for this signal.
    subscriberEmail: z.email().optional(),
    ...LlmProfileFieldsSchema,
  })
  .refine(llmRouteIsPaired, LLM_PROFILE_PAIR_ERROR)
  .refine(llmRouteIsAllowed, LLM_PROFILE_CLOUD_ERROR);

const UpdateSignalSchema = z
  .object({
    projectId: z.guid(),
    id: z.guid(),
    name: z.string().min(1, "Name is required").max(255, { error: "Name must be less than 255 characters" }),
    prompt: z.string(),
    structuredOutput: z.record(z.string(), z.unknown()),
    sampleRate: z.number().int().min(1).max(95).nullable().optional(),
    disabled: z.boolean().optional(),
    triggers: z.array(TriggerInputSchema).optional(),
    ...LlmProfileFieldsSchema,
  })
  .refine(llmRouteIsPaired, LLM_PROFILE_PAIR_ERROR)
  .refine(llmRouteIsAllowed, LLM_PROFILE_CLOUD_ERROR);

export const DeleteSignalSchema = z.object({
  projectId: z.guid(),
  id: z.guid(),
});

const DeleteSignalsSchema = z.object({
  projectId: z.guid(),
  ids: z.array(z.string()).min(1, "At least one signal ID is required"),
});

const SetTemplateSignalsSchema = z.object({
  projectId: z.guid(),
  templateNames: z.array(z.string()),
  subscriberEmail: z.email().optional(),
});

// Purge a signal's ClickHouse footprint: its events, its clusters, and the
// event<->cluster link rows. The link rows must be deleted before signal_events
// since they're resolved by event_id against it.
async function purgeSignalsFromClickhouse(projectId: string, signalIds: string[]) {
  if (signalIds.length === 0) return;
  try {
    await clickhouseClient.command({
      query: `
          DELETE FROM events_to_clusters
          WHERE project_id = {projectId: UUID}
            AND event_id IN (
              SELECT id FROM signal_events
              WHERE project_id = {projectId: UUID}
                AND signal_id IN ({signalIds: Array(UUID)})
            )
        `,
      query_params: { projectId, signalIds },
    });
    await clickhouseClient.command({
      query: `
          DELETE FROM signal_event_clusters
          WHERE project_id = {projectId: UUID}
            AND signal_id IN ({signalIds: Array(UUID)})
        `,
      query_params: { projectId, signalIds },
    });
    await clickhouseClient.command({
      query: `
          DELETE FROM signal_events
          WHERE project_id = {projectId: UUID}
            AND signal_id IN ({signalIds: Array(UUID)})
        `,
      query_params: { projectId, signalIds },
    });
  } catch (error) {
    console.error("Failed to purge signals from ClickHouse:", error);
  }
}

const toTriggerInput = (row: { id: string; value: unknown; filters: unknown; mode: number }): TriggerInput => ({
  id: row.id,
  conditions: row.value as Filter[],
  filters: (row.filters ?? []) as Filter[],
  mode: row.mode,
});

const insertTrigger = async (tx: Transaction, projectId: string, signalId: string, trigger: TriggerInput) => {
  const [created] = await tx
    .insert(signalTriggers)
    .values({
      projectId,
      signalId,
      value: trigger.conditions,
      filters: trigger.filters,
      mode: trigger.mode,
    })
    .returning();
  return toTriggerInput(created);
};

const syncTriggersInTx = async (
  tx: Transaction,
  projectId: string,
  signalId: string,
  triggers: TriggerInput[]
): Promise<TriggerInput[]> => {
  const existing = await tx
    .select({ id: signalTriggers.id })
    .from(signalTriggers)
    .where(and(eq(signalTriggers.projectId, projectId), eq(signalTriggers.signalId, signalId)));

  const incomingIds = new Set(triggers.filter((t) => t.id).map((t) => t.id!));
  const toDelete = existing.map((row) => row.id).filter((id) => !incomingIds.has(id));

  if (toDelete.length > 0) {
    await tx
      .delete(signalTriggers)
      .where(
        and(
          eq(signalTriggers.projectId, projectId),
          eq(signalTriggers.signalId, signalId),
          inArray(signalTriggers.id, toDelete)
        )
      );
  }

  const synced: TriggerInput[] = [];
  for (const trigger of triggers) {
    if (!trigger.id) {
      synced.push(await insertTrigger(tx, projectId, signalId, trigger));
      continue;
    }

    const [updated] = await tx
      .update(signalTriggers)
      .set({
        value: trigger.conditions,
        filters: trigger.filters,
        mode: trigger.mode,
      })
      .where(
        and(
          eq(signalTriggers.projectId, projectId),
          eq(signalTriggers.signalId, signalId),
          eq(signalTriggers.id, trigger.id)
        )
      )
      .returning();

    synced.push(
      updated ? toTriggerInput(updated) : await insertTrigger(tx, projectId, signalId, { ...trigger, id: undefined })
    );
  }
  return synced;
};

const newestTrigger = async (tx: Transaction, projectId: string, signalId: string) => {
  const [row] = await tx
    .select({
      value: signalTriggers.value,
      filters: signalTriggers.filters,
      mode: signalTriggers.mode,
    })
    .from(signalTriggers)
    .where(and(eq(signalTriggers.projectId, projectId), eq(signalTriggers.signalId, signalId)))
    .orderBy(desc(signalTriggers.createdAt), desc(signalTriggers.id))
    .limit(1);
  return row;
};

// Replaces the project's template signals with `templateNames`. Scope is
// limited to template-named rows; custom user signals are never touched.
// All creates + deletes commit in a single Postgres transaction so a partial
// failure can't leave the project with half-applied template changes.
export async function setTemplateSignals(input: z.infer<typeof SetTemplateSignalsSchema>) {
  const { projectId, templateNames, subscriberEmail } = SetTemplateSignalsSchema.parse(input);

  const templatesByName = new Map(signalTemplates.map((t) => [t.name, t]));
  const selected = new Set(templateNames.filter((n) => templatesByName.has(n)));

  const existing = await db
    .select({ id: signals.id, name: signals.name })
    .from(signals)
    .where(and(eq(signals.projectId, projectId), inArray(signals.name, Array.from(templatesByName.keys()))));

  const existingNames = new Set(existing.map((s) => s.name));
  const toCreate = Array.from(selected).filter((n) => !existingNames.has(n));
  const toDeleteIds = existing.filter((s) => !selected.has(s.name)).map((s) => s.id);

  if (toCreate.length === 0 && toDeleteIds.length === 0) {
    return { created: 0, deleted: 0 };
  }

  const clusteringEnabled = isFeatureEnabled(Feature.CLUSTERING);

  const deletedSignals = await db.transaction(async (tx) => {
    // Sequential, not Promise.all: drizzle serialises statements on a single
    // connection, and we want a deterministic abort point on failure.
    for (const name of toCreate) {
      const template = templatesByName.get(name)!;

      const [signal] = await tx
        .insert(signals)
        .values({
          projectId,
          name: template.name,
          prompt: template.prompt,
          structuredOutputSchema: JSON.parse(template.structuredOutputSchema) as Record<string, unknown>,
        })
        .returning();

      const alertsToInsert: (typeof alerts.$inferInsert)[] = [
        {
          projectId,
          name: `${template.name} alert`,
          type: "SIGNAL_EVENT",
          sourceId: signal.id,
          metadata: {
            severities: [SEVERITY_LEVEL.CRITICAL],
            skipSimilar: clusteringEnabled,
          },
        },
      ];

      if (clusteringEnabled) {
        alertsToInsert.push({
          projectId,
          name: `${template.name} cluster alert`,
          type: "NEW_CLUSTER",
          sourceId: signal.id,
          metadata: {},
        });
      }

      const insertedAlerts = await tx.insert(alerts).values(alertsToInsert).returning({ id: alerts.id });

      if (subscriberEmail && insertedAlerts.length > 0) {
        await tx.insert(alertTargets).values(
          insertedAlerts.map((a) => ({
            alertId: a.id,
            projectId,
            type: "EMAIL" as const,
            email: subscriberEmail,
          }))
        );
      }

      // Mirror the default trigger seeded by createWorkspace's Failure Detector
      // so every template a user toggles on actually fires.
      await tx.insert(signalTriggers).values({
        projectId,
        signalId: signal.id,
        value: DEFAULT_SIGNAL_TRIGGER_VALUE,
        filters: DEFAULT_SIGNAL_TRIGGER_FILTERS,
      });

      await mintSignalVersion(
        tx,
        projectId,
        signal.id,
        buildSignalDefinition({
          name: template.name,
          prompt: template.prompt,
          structuredOutputSchema: signal.structuredOutputSchema as Record<string, unknown>,
          trigger: DEFAULT_SIGNAL_TRIGGER_VALUE,
          filters: DEFAULT_SIGNAL_TRIGGER_FILTERS,
          mode: 0,
        })
      );
    }

    if (toDeleteIds.length === 0) return [];

    await tx
      .delete(alerts)
      .where(
        and(
          eq(alerts.projectId, projectId),
          inArray(alerts.sourceId, toDeleteIds),
          inArray(alerts.type, ["SIGNAL_EVENT", "NEW_CLUSTER"])
        )
      );

    return tx
      .delete(signals)
      .where(and(eq(signals.projectId, projectId), inArray(signals.id, toDeleteIds)))
      .returning();
  });

  await purgeSignalsFromClickhouse(
    projectId,
    deletedSignals.map((s) => s.id)
  );

  // Creates write triggers too, so invalidate the cache whenever anything changed.
  await cache.remove(`${SIGNAL_TRIGGERS_CACHE_KEY}:${projectId}`);

  return { created: toCreate.length, deleted: toDeleteIds.length };
}

export async function getSignals(input: z.infer<typeof GetSignalsSchema>) {
  const { projectId, pastHours, startDate, endDate, search, pageNumber, pageSize, filter, sortBy, sortDirection } =
    input;

  const limit = pageSize;
  const offset = Math.max(0, pageNumber * pageSize);

  const whereConditions = [eq(signals.projectId, projectId)];

  if (pastHours || (startDate && endDate)) {
    const timeRange = getTimeRange(pastHours, startDate, endDate);

    if ("start" in timeRange && timeRange.start) {
      whereConditions.push(gte(signals.createdAt, timeRange.start.toISOString()));
    }
    if ("end" in timeRange && timeRange.end) {
      whereConditions.push(lte(signals.createdAt, timeRange.end.toISOString()));
    }
    if ("pastHours" in timeRange && typeof timeRange.pastHours === "number") {
      const start = new Date(Date.now() - timeRange.pastHours * 60 * 60 * 1000);
      whereConditions.push(gte(signals.createdAt, start.toISOString()));
    }
  }

  if (search) {
    const escapedSearch = search.replace(/%/g, "\\%").replace(/_/g, "\\_");
    whereConditions.push(ilike(signals.name, `%${escapedSearch}%`));
  }

  const filterConditions = parseFilters(filter, {
    name: { type: "string", column: signals.name },
    id: { type: "string", column: signals.id },
  } as const);

  whereConditions.push(...filterConditions);

  const sortableColumns = {
    name: signals.name,
    prompt: signals.prompt,
    createdAt: signals.createdAt,
  } as const;
  const sortColumn =
    sortBy && sortBy in sortableColumns ? sortableColumns[sortBy as keyof typeof sortableColumns] : null;
  const sortOrder = sortDirection === "ASC" ? asc : desc;

  const results = await db
    .select({
      id: signals.id,
      createdAt: signals.createdAt,
      name: signals.name,
      prompt: signals.prompt,
      projectId: signals.projectId,
      metadata: signals.metadata,
      version: signals.version,
    })
    .from(signals)
    .where(and(...whereConditions))
    .orderBy(
      ...(sortColumn
        ? [sortOrder(sortColumn), desc(signals.createdAt)]
        : [
            asc(sql<number>`CASE WHEN ${signals.metadata}->>'disabled' = 'true' THEN 1 ELSE 0 END`),
            desc(signals.createdAt),
          ])
    )
    .limit(limit)
    .offset(offset);

  const signalIds = results.map((r) => r.id);
  const eventCountBySignal: Record<string, number> = {};
  const clusterCountBySignal: Record<string, number> = {};
  const lastEventBySignal: Record<string, string> = {};
  const runCountBySignal: Record<string, number> = {};

  if (signalIds.length > 0) {
    const [eventStats, clusterCounts, runCounts] = await Promise.all([
      executeQuery<{ signal_id: string; count: string; last_event_at: string }>({
        projectId,
        query: `
        SELECT
          signal_id,
          count(*) as count,
          formatDateTime(max(timestamp), '%Y-%m-%dT%H:%i:%S.%fZ') as last_event_at
        FROM signal_events
        WHERE signal_id IN ({signalIds: Array(UUID)})
        GROUP BY signal_id
      `,
        parameters: { signalIds },
      }),
      executeQuery<{ signal_id: string; count: string }>({
        projectId,
        query: `
        SELECT
          signal_id,
          count(*) as count
        FROM clusters
        WHERE signal_id IN ({signalIds: Array(UUID)})
          AND level != 0
        GROUP BY signal_id
      `,
        parameters: { signalIds },
      }),
      executeQuery<{ signal_id: string; count: string }>({
        projectId,
        query: `
        SELECT
          signal_id,
          uniqExact(run_id) as count
        FROM signal_runs
        WHERE signal_id IN ({signalIds: Array(UUID)})
        GROUP BY signal_id
      `,
        parameters: { signalIds },
      }),
    ]);

    for (const row of eventStats) {
      eventCountBySignal[row.signal_id] = parseInt(row.count, 10);
      lastEventBySignal[row.signal_id] = row.last_event_at;
    }

    for (const row of clusterCounts) {
      clusterCountBySignal[row.signal_id] = parseInt(row.count, 10);
    }

    for (const row of runCounts) {
      runCountBySignal[row.signal_id] = parseInt(row.count, 10);
    }
  }

  const items: SignalRow[] = results.map(({ metadata, ...signal }) => ({
    ...signal,
    disabled: (metadata as SignalMetadata)?.disabled ?? false,
    eventsCount: eventCountBySignal[signal.id] || 0,
    clustersCount: clusterCountBySignal[signal.id] || 0,
    lastEventAt: lastEventBySignal[signal.id] || null,
    runsCount: runCountBySignal[signal.id] || 0,
    versionsCount: null,
  }));

  return {
    items,
  };
}

export async function getSignal(input: z.infer<typeof GetSignalSchema>) {
  const { id, projectId } = GetSignalSchema.parse(input);

  const [result] = await db
    .select()
    .from(signals)
    .where(and(eq(signals.projectId, projectId), eq(signals.id, id)))
    .limit(1);

  if (!result) {
    return result;
  }

  const triggerRows = (await db
    .select({
      id: signalTriggers.id,
      value: signalTriggers.value,
      filters: signalTriggers.filters,
      createdAt: signalTriggers.createdAt,
      mode: signalTriggers.mode,
    })
    .from(signalTriggers)
    .where(and(eq(signalTriggers.projectId, projectId), eq(signalTriggers.signalId, result.id)))) as {
    id: string;
    value: Filter[];
    filters: Filter[];
    createdAt: string;
    mode: number;
  }[];

  const metadata = (result.metadata ?? {}) as SignalMetadata;

  return {
    ...result,
    structuredOutput: result.structuredOutputSchema,
    sampleRate: metadata.sampleRate ?? null,
    disabled: metadata.disabled ?? false,
    triggers: triggerRows.map((row) => ({
      id: row.id,
      conditions: row.value,
      filters: row.filters ?? [],
      createdAt: row.createdAt,
      mode: row.mode,
    })),
  };
}

const llmProfileError = (path: string, message: string) =>
  new z.ZodError([{ code: "custom", path: [path], message, input: undefined }]);

/**
 * Confirms a pinned route belongs to the project's workspace and lists the model
 * (the composite FK is the backstop). Undefined means there is no route to write,
 * which leaves the stored columns alone — drizzle skips undefined keys. The flag
 * is re-checked here so a caller that skipped `llmRouteIsAllowed` still can't pin
 * a route on Cloud; that refine owns the user-facing 400.
 */
async function resolveLlmRoute(
  projectId: string,
  llmProfileId: string | undefined,
  llmModel: string | undefined
): Promise<{ llmProfileId: string; llmModel: string } | undefined> {
  if (!isFeatureEnabled(Feature.SIGNAL_LLM_PROFILES) || llmProfileId === undefined || llmModel === undefined) {
    return undefined;
  }

  const [match] = await db
    .select({ model: llmProfileModels.name })
    .from(llmProfiles)
    .innerJoin(projects, and(eq(projects.workspaceId, llmProfiles.workspaceId), eq(projects.id, projectId)))
    .leftJoin(
      llmProfileModels,
      and(eq(llmProfileModels.profileId, llmProfiles.id), eq(llmProfileModels.name, llmModel))
    )
    .where(eq(llmProfiles.id, llmProfileId))
    .limit(1);

  if (!match) throw llmProfileError("llmProfileId", "LLM profile not found in this workspace");
  if (!match.model) throw llmProfileError("llmModel", "The selected model is not part of this LLM profile");
  return { llmProfileId, llmModel };
}

export async function createSignal(
  input: z.infer<typeof CreateSignalSchema>,
  // Seeded default signals have no profile to pick; they run on env credentials until edited.
  { requireLlmProfile = true }: { requireLlmProfile?: boolean } = {}
) {
  const {
    projectId,
    name,
    prompt,
    structuredOutput,
    sampleRate,
    disabled,
    subscriberEmail,
    triggers,
    llmProfileId,
    llmModel,
  } = CreateSignalSchema.parse(input);

  if (requireLlmProfile && llmProfileId === undefined && isFeatureEnabled(Feature.SIGNAL_LLM_PROFILES)) {
    throw llmProfileError("llmProfileId", "Select an LLM profile and a model");
  }

  const metadata: SignalMetadata = {};
  if (sampleRate != null) metadata.sampleRate = sampleRate;
  // Only persist `disabled` when deactivated; absence means active.
  if (disabled === true) metadata.disabled = true;

  const llmRoute = await resolveLlmRoute(projectId, llmProfileId, llmModel);
  const result = await db.transaction(async (tx) => {
    const [signal] = await tx
      .insert(signals)
      .values({
        projectId,
        name,
        prompt,
        structuredOutputSchema: structuredOutput,
        metadata,
        ...llmRoute,
      })
      .returning();

    const seededTriggers: TriggerInput[] =
      triggers && triggers.length > 0
        ? triggers
        : [
            {
              conditions: DEFAULT_SIGNAL_TRIGGER_VALUE as Filter[],
              filters: DEFAULT_SIGNAL_TRIGGER_FILTERS as Filter[],
              mode: 1,
            },
          ];

    const syncedTriggers: TriggerInput[] = [];
    for (const trigger of seededTriggers) {
      syncedTriggers.push(await insertTrigger(tx, projectId, signal.id, trigger));
    }

    const newest = await newestTrigger(tx, projectId, signal.id);
    await mintSignalVersion(
      tx,
      projectId,
      signal.id,
      buildSignalDefinition({
        name,
        prompt,
        structuredOutputSchema: structuredOutput,
        trigger: newest?.value,
        filters: newest?.filters,
        mode: newest?.mode,
        sampleRate: metadata.sampleRate,
        disabled: metadata.disabled,
        llmProfileId: llmRoute?.llmProfileId ?? null,
        llmModel: llmRoute?.llmModel ?? null,
      })
    );

    const clusteringEnabled = isFeatureEnabled(Feature.CLUSTERING);

    const alertsToInsert: (typeof alerts.$inferInsert)[] = [
      {
        projectId,
        name: `${name} alert`,
        type: "SIGNAL_EVENT",
        sourceId: signal.id,
        metadata: {
          severities: [SEVERITY_LEVEL.CRITICAL],
          // skipSimilar depends on the clustering service; default to false when
          // clustering is disabled so the backend doesn't silently drop notifications.
          skipSimilar: clusteringEnabled,
        },
      },
    ];

    if (clusteringEnabled) {
      alertsToInsert.push({
        projectId,
        name: `${name} cluster alert`,
        type: "NEW_CLUSTER",
        sourceId: signal.id,
        metadata: {},
      });
    }

    const insertedAlerts = await tx.insert(alerts).values(alertsToInsert).returning({ id: alerts.id });

    if (subscriberEmail && insertedAlerts.length > 0) {
      await tx.insert(alertTargets).values(
        insertedAlerts.map((a) => ({
          alertId: a.id,
          projectId,
          type: "EMAIL",
          email: subscriberEmail,
        }))
      );
    }

    return { ...signal, triggers: syncedTriggers };
  });

  await cache.remove(`${SIGNAL_TRIGGERS_CACHE_KEY}:${projectId}`);

  return result;
}

export async function updateSignal(input: z.infer<typeof UpdateSignalSchema>) {
  const { projectId, id, name, prompt, structuredOutput, sampleRate, disabled, triggers, llmProfileId, llmModel } =
    UpdateSignalSchema.parse(input);

  // No "required" check here: an edit must not force a legacy env-backed signal onto a profile.
  const llmRoute = await resolveLlmRoute(projectId, llmProfileId, llmModel);

  // FOR UPDATE serializes the version insert against the denormalized `version` bump.
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        metadata: signals.metadata,
        llmProfileId: signals.llmProfileId,
        llmModel: signals.llmModel,
      })
      .from(signals)
      .where(and(eq(signals.projectId, projectId), eq(signals.id, id)))
      .for("update");

    if (!existing) return undefined;

    // Merge over stored metadata so omitted fields keep their values — a PUT
    // without `disabled` must not silently re-enable a deactivated signal.
    const metadata: SignalMetadata = { ...((existing.metadata ?? {}) as SignalMetadata) };
    if (sampleRate !== undefined) metadata.sampleRate = sampleRate;
    // Only persist `disabled` when deactivated; absence means active.
    if (disabled !== undefined) {
      if (disabled) metadata.disabled = true;
      else delete metadata.disabled;
    }

    const syncedTriggers = triggers !== undefined ? await syncTriggersInTx(tx, projectId, id, triggers) : undefined;

    const newest = await newestTrigger(tx, projectId, id);
    const newVersion = await mintSignalVersion(
      tx,
      projectId,
      id,
      buildSignalDefinition({
        name,
        prompt,
        structuredOutputSchema: structuredOutput,
        trigger: newest?.value,
        filters: newest?.filters,
        mode: newest?.mode,
        sampleRate: metadata.sampleRate,
        disabled: metadata.disabled,
        llmProfileId: llmRoute?.llmProfileId ?? existing.llmProfileId ?? null,
        llmModel: llmRoute?.llmModel ?? existing.llmModel ?? null,
      })
    );

    const [updated] = await tx
      .update(signals)
      .set({
        name,
        prompt,
        structuredOutputSchema: structuredOutput,
        metadata,
        ...llmRoute,
        ...(newVersion === null ? {} : { version: newVersion }),
      })
      .where(and(eq(signals.projectId, projectId), eq(signals.id, id)))
      .returning();

    return { ...updated, triggers: syncedTriggers };
  });

  await cache.remove(`${SIGNAL_TRIGGERS_CACHE_KEY}:${projectId}`);

  return result;
}

export async function deleteSignal(input: z.infer<typeof DeleteSignalSchema>) {
  const { projectId, id } = DeleteSignalSchema.parse(input);

  const [result] = await db.transaction(async (tx) => {
    await tx
      .delete(alerts)
      .where(
        and(
          eq(alerts.projectId, projectId),
          eq(alerts.sourceId, id),
          inArray(alerts.type, ["SIGNAL_EVENT", "NEW_CLUSTER"])
        )
      );

    return tx
      .delete(signals)
      .where(and(eq(signals.projectId, projectId), eq(signals.id, id)))
      .returning();
  });

  await purgeSignalsFromClickhouse(projectId, [id]);

  await cache.remove(`${SIGNAL_TRIGGERS_CACHE_KEY}:${projectId}`);

  return result;
}

export async function deleteSignals(input: z.infer<typeof DeleteSignalsSchema>) {
  const { projectId, ids } = DeleteSignalsSchema.parse(input);

  const deletedSignals = await db.transaction(async (tx) => {
    await tx
      .delete(alerts)
      .where(
        and(
          eq(alerts.projectId, projectId),
          inArray(alerts.sourceId, ids),
          inArray(alerts.type, ["SIGNAL_EVENT", "NEW_CLUSTER"])
        )
      );

    return tx
      .delete(signals)
      .where(and(eq(signals.projectId, projectId), inArray(signals.id, ids)))
      .returning();
  });

  await purgeSignalsFromClickhouse(
    projectId,
    deletedSignals.map((s) => s.id)
  );

  await cache.remove(`${SIGNAL_TRIGGERS_CACHE_KEY}:${projectId}`);

  return { success: true };
}

export { getTraceSignals } from "./trace";
