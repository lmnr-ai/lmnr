import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod/v4";

import { type Filter } from "@/lib/actions/common/filters";
import { createSignalTrigger } from "@/lib/actions/signal-triggers";
import { createSignal } from "@/lib/actions/signals";
import { auth } from "@/lib/auth";
import { isUserMemberOfProject } from "@/lib/authorization";

// Same identifier rule the create-signal drawer enforces per schema field
// (schema-field-row.tsx) and that the Rust search/sort paths re-enforce at
// query time — a non-identifier field name is silently unsearchable/unsortable.
const FIELD_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

// Mirrors schemaFieldsToJsonSchema (components/signals/utils.ts): every
// property is string/number/boolean (enum fields are string + enum values),
// carries a description, and is listed in `required`.
const PropertySchema = z
  .object({
    type: z.enum(["string", "number", "boolean"]),
    description: z.string(),
    enum: z.array(z.string().min(1)).min(1).optional(),
  })
  .strict()
  .refine((p) => !p.enum || p.type === "string", {
    message: "enum values are only allowed on string properties",
  });

const StructuredOutputSchema = z
  .object({
    type: z.literal("object"),
    properties: z.record(z.string().regex(FIELD_NAME_RE, "Field names must be valid identifiers"), PropertySchema),
    required: z.array(z.string()),
  })
  .strict()
  .refine((s) => Object.keys(s.properties).length > 0, { message: "At least one payload field is required" })
  .refine(
    (s) => {
      const names = Object.keys(s.properties);
      return s.required.length === names.length && names.every((n) => s.required.includes(n));
    },
    { message: "`required` must list exactly the property names" }
  );

// The trigger columns + operators the create-signal drawer offers
// (SIGNAL_TRIGGER_COLUMNS + dataTypeOperationsMap). Enum columns are pinned to
// their single UI option; number values may be numbers or numeric strings
// (the Rust evaluator parses both).
const EnumOps = z.enum(["eq", "ne"]);
const TriggerFilterSchema = z.union([
  z.object({ column: z.literal("span_name"), operator: EnumOps, value: z.string().min(1) }).strict(),
  z.object({ column: z.literal("status"), operator: EnumOps, value: z.literal("error") }).strict(),
  z.object({ column: z.literal("root_span_finished"), operator: EnumOps, value: z.literal("true") }).strict(),
  z
    .object({
      column: z.literal("total_token_count"),
      operator: z.enum(["eq", "ne", "gt", "gte", "lt", "lte"]),
      value: z.union([
        z.number(),
        z
          .string()
          .min(1)
          .refine((v) => Number.isFinite(Number(v)), { message: "Value must be a number" }),
      ]),
    })
    .strict(),
]);

const TriggerSchema = z
  .object({
    filters: z.array(TriggerFilterSchema).min(1),
    // 0 = batch, 1 = realtime. Batch is currently feature-disabled, so the
    // default mirrors the create-signal drawer's realtime default.
    mode: z.number().int().min(0).max(1).default(1),
  })
  .strict();

const Body = z
  .object({
    projectId: z.guid(),
    name: z.string().min(1, "Name is required").max(255, "Name must be less than 255 characters"),
    prompt: z.string().min(1, "Prompt is required"),
    structuredOutput: StructuredOutputSchema,
    sampleRate: z.number().int().min(1).max(95).nullable().optional(),
    disabled: z.boolean().optional(),
    // Omitted → the drawer's default trigger is seeded so the signal actually
    // fires. Pass [] explicitly to create a signal with no triggers.
    triggers: z.array(TriggerSchema).optional(),
  })
  .strict();

// The create-signal drawer's default trigger (getDefaultTriggers, realtime
// mode — batch signals are feature-disabled).
const DEFAULT_TRIGGERS: z.infer<typeof TriggerSchema>[] = [
  {
    filters: [
      { column: "root_span_finished", operator: "eq", value: "true" },
      { column: "total_token_count", operator: "gt", value: 1000 },
    ],
    mode: 1,
  },
];

const isUniqueNameViolation = (error: unknown): boolean => {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const {
      code,
      constraint_name: constraintName,
      cause,
    } = current as {
      code?: string;
      constraint_name?: string;
      cause?: unknown;
    };
    if (code === "23505" && (!constraintName || constraintName === "signals_project_id_name_key")) {
      return true;
    }
    current = cause;
  }
  return false;
};

// Creates a signal (plus its auto-created alerts and triggers) for the
// session-bearer user — the CLI's `signal create` is the caller today. Reuses
// the same `createSignal` / `createSignalTrigger` actions as the UI so the
// resulting rows are identical to a drawer-created signal. Auth comes from a
// BetterAuth session token via the bearer() plugin; membership is checked
// fresh because /api/cli/* is not covered by the proxy.ts matcher.
export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = Body.parse(await req.json().catch(() => ({})));
    const { projectId, name, prompt, structuredOutput, sampleRate, disabled } = body;

    const member = await isUserMemberOfProject(projectId, session.user.id, { skipCache: true });
    if (!member) {
      return NextResponse.json({ error: "You do not have access to this project" }, { status: 403 });
    }

    let signal;
    try {
      signal = await createSignal({
        projectId,
        name,
        prompt,
        structuredOutput,
        sampleRate,
        disabled,
        subscriberEmail: session.user.email ?? undefined,
      });
    } catch (error) {
      if (isUniqueNameViolation(error)) {
        return NextResponse.json({ error: `A signal named "${name}" already exists in this project` }, { status: 409 });
      }
      throw error;
    }

    const triggersToCreate = body.triggers ?? DEFAULT_TRIGGERS;
    const createdTriggers = [];
    for (const trigger of triggersToCreate) {
      try {
        const created = await createSignalTrigger({
          projectId,
          signalId: signal.id,
          // The narrowed per-column filter union is a strict subset of Filter.
          filters: trigger.filters as Filter[],
          mode: trigger.mode,
        });
        createdTriggers.push({ id: created.id, filters: created.filters, mode: created.mode });
      } catch (error) {
        // The signal row is already committed — report it so the caller can
        // retry trigger creation instead of re-creating (and 409ing on) the signal.
        console.error("cli signals: trigger creation failed:", error);
        return NextResponse.json(
          {
            error: "Signal was created but one or more triggers failed to create",
            signalId: signal.id,
            triggers: createdTriggers,
          },
          { status: 500 }
        );
      }
    }

    const metadata = (signal.metadata ?? {}) as { sampleRate?: number | null; disabled?: boolean };

    return NextResponse.json({
      id: signal.id,
      projectId: signal.projectId,
      name: signal.name,
      prompt: signal.prompt,
      structuredOutput: signal.structuredOutputSchema,
      sampleRate: metadata.sampleRate ?? null,
      disabled: metadata.disabled ?? false,
      createdAt: signal.createdAt,
      triggers: createdTriggers,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }
    // Don't leak internal error details (DB errors can carry schema/connection
    // info) to API clients — log server-side, return a generic message.
    console.error("cli signals error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
