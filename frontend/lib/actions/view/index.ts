import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { FilterSchemaRelaxed } from "@/lib/actions/common/filter-schemas";
import { ApiError, NotFoundError } from "@/lib/api/errors";
import { db } from "@/lib/db/drizzle";
import { tableViews } from "@/lib/db/migrations/schema";

const ViewConfigSchema = z.object({
  columnOrder: z.array(z.string()).optional(),
  columnVisibility: z.record(z.string(), z.boolean()).optional(),
  columnSizing: z.record(z.string(), z.number()).optional(),
  customColumns: z
    .array(z.object({ name: z.string().min(1), sql: z.string().min(1), dataType: z.enum(["string", "number"]) }))
    .optional(),
  // View-managed runtime params persisted alongside column config. searchIn is
  // intentionally omitted — we always search across every searchable field.
  filters: z.array(FilterSchemaRelaxed).optional(),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortDirection: z.enum(["asc", "desc"]).optional(),
});

// Every table that passes `views={{ resource }}` to its InfiniteDataTable. A view under any other
// name is saved but no table ever shows it, so CLI typos fail here instead.
const VIEW_RESOURCES = [
  "traces",
  "spans",
  "sessions",
  "evaluations",
  "evaluation-v1.1",
  "datasets",
  "dataset",
  "queues",
  "playgrounds",
  "debugger-sessions",
  "signal-runs",
] as const;

const ViewResourceSchema = z.union([
  z.enum(VIEW_RESOURCES),
  z.string().regex(/^signal-events:[0-9a-f-]{36}$/i, "Unknown table"),
]);

const ViewNameSchema = z.string().min(1).max(120);

class DuplicateViewNameError extends ApiError {
  constructor(name: string) {
    super(`A view named "${name}" already exists for this table`, 409);
    this.name = "DuplicateViewNameError";
  }
}

function isUniqueViolation(e: unknown): boolean {
  const code =
    (e as { code?: string; cause?: { code?: string } } | null)?.cause?.code ?? (e as { code?: string })?.code;
  return code === "23505";
}

async function withNameConflict<T>(name: string | undefined, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (e) {
    if (name !== undefined && isUniqueViolation(e)) throw new DuplicateViewNameError(name);
    throw e;
  }
}

export const CreateViewSchema = z.object({
  projectId: z.guid(),
  resource: ViewResourceSchema,
  name: ViewNameSchema,
  config: ViewConfigSchema,
  isDefault: z.literal(true).optional(),
});

export async function createView(input: z.infer<typeof CreateViewSchema>) {
  const { projectId, resource, name, config, isDefault } = CreateViewSchema.parse(input);

  const [result] = await withNameConflict(name, () =>
    db.insert(tableViews).values({ projectId, resource, name, config }).returning()
  );
  if (!result) throw new Error("Failed to create view");
  if (isDefault) return setDefaultView(projectId, result.id, true);
  return result;
}

export const UpdateViewSchema = z.object({
  projectId: z.guid(),
  viewId: z.guid(),
  name: ViewNameSchema.optional(),
  config: ViewConfigSchema.optional(),
  // `replace` (the UI's save) writes `config` as given; `merge` (CLI) overwrites only the
  // top-level keys sent, so an agent can change the columns without resending filters.
  configMode: z.enum(["replace", "merge"]).default("replace"),
  // false hands the default back to the table's built-in Default view.
  isDefault: z.boolean().optional(),
});

export async function updateView(input: z.input<typeof UpdateViewSchema>) {
  const { projectId, viewId, name, config, configMode, isDefault } = UpdateViewSchema.parse(input);

  if (name !== undefined || config !== undefined) {
    const json = JSON.stringify(config ?? {});
    const [row] = await withNameConflict(name, () =>
      db
        .update(tableViews)
        .set({
          ...(name !== undefined && { name }),
          // `isDefault` is not in ViewConfigSchema (zod strips it), so a replace carries it over from the row.
          ...(config !== undefined && {
            config:
              configMode === "merge"
                ? sql`${tableViews.config} || ${json}::jsonb`
                : sql`${json}::jsonb || jsonb_strip_nulls(jsonb_build_object('isDefault', ${tableViews.config} -> 'isDefault'))`,
          }),
          updatedAt: new Date().toISOString(),
        })
        .where(and(eq(tableViews.id, viewId), eq(tableViews.projectId, projectId)))
        .returning()
    );
    if (!row) throw new NotFoundError("View not found");
    if (isDefault === undefined) return row;
  }
  if (isDefault === undefined) throw new ApiError("Nothing to update", 400);
  return setDefaultView(projectId, viewId, isDefault);
}

// The team default is `config.isDefault` on the view row, so deleting the view drops it with no
// orphan. One statement over every view of the resource keeps at most one flagged under concurrency.
async function setDefaultView(projectId: string, viewId: string, isDefault: boolean) {
  const resource = db
    .select({ resource: tableViews.resource })
    .from(tableViews)
    .where(and(eq(tableViews.id, viewId), eq(tableViews.projectId, projectId)));

  const rows = await db
    .update(tableViews)
    .set({
      config: isDefault
        ? sql`CASE WHEN ${tableViews.id} = ${viewId} THEN ${tableViews.config} || '{"isDefault": true}'::jsonb ELSE ${tableViews.config} - 'isDefault' END`
        : sql`${tableViews.config} - 'isDefault'`,
    })
    .where(
      isDefault
        ? and(eq(tableViews.projectId, projectId), inArray(tableViews.resource, resource))
        : and(eq(tableViews.id, viewId), eq(tableViews.projectId, projectId))
    )
    .returning();
  const result = rows.find((r) => r.id === viewId);
  if (!result) throw new NotFoundError("View not found");
  return result;
}

export const DeleteViewSchema = z.object({
  projectId: z.guid(),
  viewId: z.guid(),
});

export async function deleteView(input: z.infer<typeof DeleteViewSchema>) {
  const { projectId, viewId } = DeleteViewSchema.parse(input);

  const [result] = await db
    .delete(tableViews)
    .where(and(eq(tableViews.id, viewId), eq(tableViews.projectId, projectId)))
    .returning();
  if (!result) throw new NotFoundError("View not found");
  return result;
}
