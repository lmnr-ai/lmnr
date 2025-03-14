import { sql } from "drizzle-orm";
import { bigint, boolean, doublePrecision, foreignKey, index, integer, jsonb, pgEnum,pgPolicy, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const labelSource = pgEnum("label_source", ['MANUAL', 'AUTO', 'CODE']);
export const spanType = pgEnum("span_type", ['DEFAULT', 'LLM', 'PIPELINE', 'EXECUTOR', 'EVALUATOR', 'EVALUATION', 'TOOL']);
export const traceType = pgEnum("trace_type", ['DEFAULT', 'EVENT', 'EVALUATION']);
export const workspaceRole = pgEnum("workspace_role", ['member', 'owner']);


export const renderTemplates = pgTable("render_templates", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  projectId: uuid("project_id").defaultRandom().notNull(),
  code: text().notNull(),
  name: text().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "render_templates_project_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
]);

export const agentMessages = pgTable("agent_messages", {
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  id: uuid().defaultRandom().primaryKey().notNull(),
  chatId: uuid("chat_id").notNull(),
  userId: uuid("user_id").notNull(),
  messageType: text("message_type").default('').notNull(),
  content: jsonb().default({}),
}, (table) => [
  foreignKey({
    columns: [table.userId],
    foreignColumns: [users.id],
    name: "agent_message_to_user_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
]);

export const agentSessions = pgTable("agent_sessions", {
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  chatId: uuid("chat_id").primaryKey().notNull(),
  cdpUrl: text("cdp_url").notNull(),
  vncUrl: text("vnc_url").notNull(),
  machineId: text("machine_id"),
  state: jsonb(),
});

export const apiKeys = pgTable("api_keys", {
  apiKey: text("api_key").primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  userId: uuid("user_id").notNull(),
  name: text().default('default').notNull(),
}, (table) => [
  index("api_keys_user_id_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [users.id],
    name: "api_keys_user_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  pgPolicy("Enable insert for authenticated users only", { as: "permissive", for: "all", to: ["service_role"], using: sql`true`, withCheck: sql`true` }),
]);

export const labelClasses = pgTable("label_classes", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  name: text().notNull(),
  projectId: uuid("project_id").notNull(),
  description: text(),
  evaluatorRunnableGraph: jsonb("evaluator_runnable_graph"),
  pipelineVersionId: uuid("pipeline_version_id"),
  color: text().default('rgb(190, 194, 200)').notNull(),
}, (table) => [
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "label_classes_project_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  unique("label_classes_project_id_id_key").on(table.id, table.projectId),
  unique("label_classes_name_project_id_unique").on(table.name, table.projectId),
]);

export const labelingQueueItems = pgTable("labeling_queue_items", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  queueId: uuid("queue_id").defaultRandom().notNull(),
  action: jsonb().notNull(),
  spanId: uuid("span_id").notNull(),
}, (table) => [
  foreignKey({
    columns: [table.queueId],
    foreignColumns: [labelingQueues.id],
    name: "labelling_queue_items_queue_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
]);

export const events = pgTable("events", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  timestamp: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
  name: text().notNull(),
  attributes: jsonb().default({}).notNull(),
  spanId: uuid("span_id").notNull(),
  projectId: uuid("project_id").notNull(),
}, (table) => [
  index("events_span_id_project_id_idx").using("btree", table.spanId.asc().nullsLast().op("uuid_ops"), table.projectId.asc().nullsLast().op("uuid_ops")),
  foreignKey({
    columns: [table.spanId, table.projectId],
    foreignColumns: [spans.spanId, spans.projectId],
    name: "events_span_id_project_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
]);

export const labelClassesForPath = pgTable("label_classes_for_path", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  projectId: uuid("project_id").defaultRandom().notNull(),
  path: text().notNull(),
  labelClassId: uuid("label_class_id").notNull(),
}, (table) => [
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "autoeval_labels_project_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  unique("unique_project_id_path_label_class").on(table.projectId, table.path, table.labelClassId),
]);

export const llmPrices = pgTable("llm_prices", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  provider: text().notNull(),
  model: text().notNull(),
  inputPricePerMillion: doublePrecision("input_price_per_million").notNull(),
  outputPricePerMillion: doublePrecision("output_price_per_million").notNull(),
  inputCachedPricePerMillion: doublePrecision("input_cached_price_per_million"),
  additionalPrices: jsonb("additional_prices").default({}).notNull(),
});

export const pipelineTemplates = pgTable("pipeline_templates", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  runnableGraph: jsonb("runnable_graph").default({}).notNull(),
  displayableGraph: jsonb("displayable_graph").default({}).notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  numberOfNodes: bigint("number_of_nodes", { mode: "number" }).notNull(),
  name: text().default('').notNull(),
  description: text().default('').notNull(),
  displayGroup: text("display_group").default('build').notNull(),
  ordinal: integer().default(500).notNull(),
});

export const evaluationScores = pgTable("evaluation_scores", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  resultId: uuid("result_id").defaultRandom().notNull(),
  name: text().default('').notNull(),
  score: doublePrecision().notNull(),
  labelId: uuid("label_id"),
}, (table) => [
  index("evaluation_scores_result_id_idx").using("hash", table.resultId.asc().nullsLast().op("uuid_ops")),
  foreignKey({
    columns: [table.resultId],
    foreignColumns: [evaluationResults.id],
    name: "evaluation_scores_result_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  unique("evaluation_results_names_unique").on(table.resultId, table.name),
]);

export const labelingQueues = pgTable("labeling_queues", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  name: text().notNull(),
  projectId: uuid("project_id").notNull(),
}, (table) => [
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "labeling_queues_project_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
]);

export const datasets = pgTable("datasets", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  name: text().notNull(),
  projectId: uuid("project_id").defaultRandom().notNull(),
  indexedOn: text("indexed_on"),
}, (table) => [
  index("datasets_project_id_hash_idx").using("hash", table.projectId.asc().nullsLast().op("uuid_ops")),
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "public_datasets_project_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
]);

export const targetPipelineVersions = pgTable("target_pipeline_versions", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  pipelineId: uuid("pipeline_id").notNull(),
  pipelineVersionId: uuid("pipeline_version_id").notNull(),
}, (table) => [
  foreignKey({
    columns: [table.pipelineId],
    foreignColumns: [pipelines.id],
    name: "target_pipeline_versions_pipeline_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  foreignKey({
    columns: [table.pipelineVersionId],
    foreignColumns: [pipelineVersions.id],
    name: "target_pipeline_versions_pipeline_version_id_fkey"
  }),
  unique("unique_pipeline_id").on(table.pipelineId),
]);

export const projects = pgTable("projects", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  name: text().notNull(),
  workspaceId: uuid("workspace_id").notNull(),
}, (table) => [
  index("projects_workspace_id_idx").using("btree", table.workspaceId.asc().nullsLast().op("uuid_ops")),
  foreignKey({
    columns: [table.workspaceId],
    foreignColumns: [workspaces.id],
    name: "projects_workspace_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
]);

export const providerApiKeys = pgTable("provider_api_keys", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  name: text().notNull(),
  projectId: uuid("project_id").defaultRandom().notNull(),
  nonceHex: text("nonce_hex").notNull(),
  value: text().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "provider_api_keys_project_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
]);

export const workspaces = pgTable("workspaces", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  name: text().notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  tierId: bigint("tier_id", { mode: "number" }).default(sql`'1'`).notNull(),
  subscriptionId: text("subscription_id").default('').notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  additionalSeats: bigint("additional_seats", { mode: "number" }).default(sql`'0'`).notNull(),
}, (table) => [
  foreignKey({
    columns: [table.tierId],
    foreignColumns: [subscriptionTiers.id],
    name: "workspaces_tier_id_fkey"
  }).onUpdate("cascade"),
]);

export const subscriptionTiers = pgTable("subscription_tiers", {
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "subscription_tiers_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  name: text().notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  storageMib: bigint("storage_mib", { mode: "number" }).notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  logRetentionDays: bigint("log_retention_days", { mode: "number" }).notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  membersPerWorkspace: bigint("members_per_workspace", { mode: "number" }).default(sql`'-1'`).notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  numWorkspaces: bigint("num_workspaces", { mode: "number" }).default(sql`'-1'`).notNull(),
  stripeProductId: text("stripe_product_id").default('').notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  events: bigint({ mode: "number" }).default(sql`'0'`).notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  spans: bigint({ mode: "number" }).default(sql`'0'`).notNull(),
  extraSpanPrice: doublePrecision("extra_span_price").default(sql`'0'`).notNull(),
  extraEventPrice: doublePrecision("extra_event_price").default(sql`'0'`).notNull(),
});

export const traces = pgTable("traces", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  sessionId: text("session_id"),
  metadata: jsonb(),
  projectId: uuid("project_id").notNull(),
  endTime: timestamp("end_time", { withTimezone: true, mode: 'string' }),
  startTime: timestamp("start_time", { withTimezone: true, mode: 'string' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  totalTokenCount: bigint("total_token_count", { mode: "number" }).default(sql`'0'`).notNull(),
  cost: doublePrecision().default(sql`'0'`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  traceType: traceType("trace_type").default('DEFAULT').notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  inputTokenCount: bigint("input_token_count", { mode: "number" }).default(sql`'0'`).notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  outputTokenCount: bigint("output_token_count", { mode: "number" }).default(sql`'0'`).notNull(),
  inputCost: doublePrecision("input_cost").default(sql`'0'`).notNull(),
  outputCost: doublePrecision("output_cost").default(sql`'0'`).notNull(),
  hasBrowserSession: boolean("has_browser_session"),
  topSpanId: uuid("top_span_id"),
}, (table) => [
  index("trace_metadata_gin_idx").using("gin", table.metadata.asc().nullsLast().op("jsonb_ops")),
  index("traces_id_project_id_start_time_times_not_null_idx").using("btree", table.id.asc().nullsLast().op("timestamptz_ops"), table.projectId.asc().nullsLast().op("timestamptz_ops"), table.startTime.desc().nullsFirst().op("uuid_ops")).where(sql`((start_time IS NOT NULL) AND (end_time IS NOT NULL))`),
  index("traces_project_id_idx").using("btree", table.projectId.asc().nullsLast().op("uuid_ops")),
  index("traces_project_id_trace_type_start_time_end_time_idx").using("btree", table.projectId.asc().nullsLast().op("timestamptz_ops"), table.startTime.asc().nullsLast().op("timestamptz_ops"), table.endTime.asc().nullsLast().op("timestamptz_ops")).where(sql`((trace_type = 'DEFAULT'::trace_type) AND (start_time IS NOT NULL) AND (end_time IS NOT NULL))`),
  index("traces_session_id_idx").using("btree", table.sessionId.asc().nullsLast().op("text_ops")),
  index("traces_start_time_end_time_idx").using("btree", table.startTime.asc().nullsLast().op("timestamptz_ops"), table.endTime.asc().nullsLast().op("timestamptz_ops")),
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "new_traces_project_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  pgPolicy("select_by_next_api_key", { as: "permissive", for: "select", to: ["anon", "authenticated"], using: sql`is_project_id_accessible_for_api_key(api_key(), project_id)` }),
]);

export const users = pgTable("users", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  name: text().notNull(),
  email: text().notNull(),
}, (table) => [
  unique("users_email_key").on(table.email),
  pgPolicy("Enable insert for authenticated users only", { as: "permissive", for: "insert", to: ["service_role"], withCheck: sql`true` }),
]);

export const playgrounds = pgTable("playgrounds", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  name: text().notNull(),
  projectId: uuid("project_id").notNull(),
  promptMessages: jsonb("prompt_messages").default([{ "role": "user", "content": "" }]).notNull(),
  modelId: text("model_id").default('').notNull(),
  outputSchema: text("output_schema"),
}, (table) => [
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "playgrounds_project_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
]);

export const userSubscriptionInfo = pgTable("user_subscription_info", {
  userId: uuid("user_id").defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  stripeCustomerId: text("stripe_customer_id").notNull(),
  activated: boolean().default(false).notNull(),
}, (table) => [
  index("user_subscription_info_stripe_customer_id_idx").using("btree", table.stripeCustomerId.asc().nullsLast().op("text_ops")),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [users.id],
    name: "user_subscription_info_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
]);

export const pipelines = pgTable("pipelines", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  projectId: uuid("project_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  name: text().notNull(),
  visibility: text().default('PRIVATE').notNull(),
  pythonRequirements: text("python_requirements").default('').notNull(),
}, (table) => [
  index("pipelines_name_project_id_idx").using("btree", table.name.asc().nullsLast().op("text_ops"), table.projectId.asc().nullsLast().op("uuid_ops")),
  index("pipelines_project_id_idx").using("btree", table.projectId.asc().nullsLast().op("uuid_ops")),
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "pipelines_project_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  unique("unique_project_id_pipeline_name").on(table.projectId, table.name),
]);

export const datasetDatapoints = pgTable("dataset_datapoints", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  datasetId: uuid("dataset_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  data: jsonb().notNull(),
  indexedOn: text("indexed_on"),
  target: jsonb().default({}),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  indexInBatch: bigint("index_in_batch", { mode: "number" }),
  metadata: jsonb().default({}),
}, (table) => [
  foreignKey({
    columns: [table.datasetId],
    foreignColumns: [datasets.id],
    name: "dataset_datapoints_dataset_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
]);

export const evaluationResults = pgTable("evaluation_results", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  evaluationId: uuid("evaluation_id").notNull(),
  data: jsonb().notNull(),
  target: jsonb().default({}).notNull(),
  executorOutput: jsonb("executor_output"),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  indexInBatch: bigint("index_in_batch", { mode: "number" }),
  traceId: uuid("trace_id").notNull(),
  index: integer().default(0).notNull(),
}, (table) => [
  index("evaluation_results_evaluation_id_idx").using("btree", table.evaluationId.asc().nullsLast().op("uuid_ops")),
  foreignKey({
    columns: [table.evaluationId],
    foreignColumns: [evaluations.id],
    name: "evaluation_results_evaluation_id_fkey1"
  }).onUpdate("cascade").onDelete("cascade"),
  pgPolicy("select_by_next_api_key", { as: "permissive", for: "select", to: ["anon", "authenticated"], using: sql`is_evaluation_id_accessible_for_api_key(api_key(), evaluation_id)` }),
]);

export const evaluations = pgTable("evaluations", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  projectId: uuid("project_id").notNull(),
  name: text().notNull(),
  groupId: text("group_id").default('default').notNull(),
}, (table) => [
  index("evaluations_project_id_hash_idx").using("hash", table.projectId.asc().nullsLast().op("uuid_ops")),
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "evaluations_project_id_fkey1"
  }).onUpdate("cascade").onDelete("cascade"),
  pgPolicy("select_by_next_api_key", { as: "permissive", for: "select", to: ["anon", "authenticated"], using: sql`is_evaluation_id_accessible_for_api_key(api_key(), id)` }),
]);

export const membersOfWorkspaces = pgTable("members_of_workspaces", {
  workspaceId: uuid("workspace_id").notNull(),
  userId: uuid("user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  id: uuid().defaultRandom().primaryKey().notNull(),
  memberRole: workspaceRole("member_role").default('owner').notNull(),
}, (table) => [
  index("members_of_workspaces_user_id_idx").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [users.id],
    name: "members_of_workspaces_user_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  foreignKey({
    columns: [table.workspaceId],
    foreignColumns: [workspaces.id],
    name: "public_members_of_workspaces_workspace_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  unique("members_of_workspaces_user_workspace_unique").on(table.workspaceId, table.userId),
]);

export const pipelineVersions = pgTable("pipeline_versions", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  pipelineId: uuid("pipeline_id").notNull(),
  displayableGraph: jsonb("displayable_graph").notNull(),
  runnableGraph: jsonb("runnable_graph").notNull(),
  pipelineType: text("pipeline_type").notNull(),
  name: text().notNull(),
}, (table) => [
  pgPolicy("all_actions_by_next_api_key", { as: "permissive", for: "all", to: ["anon", "authenticated"], using: sql`is_pipeline_id_accessible_for_api_key(api_key(), pipeline_id)` }),
]);

export const projectApiKeys = pgTable("project_api_keys", {
  value: text().default('').notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  name: text(),
  projectId: uuid("project_id").notNull(),
  shorthand: text().default('').notNull(),
  hash: text().default('').notNull(),
  id: uuid().defaultRandom().primaryKey().notNull(),
}, (table) => [
  index("project_api_keys_hash_idx").using("hash", table.hash.asc().nullsLast().op("text_ops")),
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "public_project_api_keys_project_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
]);

export const workspaceUsage = pgTable("workspace_usage", {
  workspaceId: uuid("workspace_id").defaultRandom().primaryKey().notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  spanCount: bigint("span_count", { mode: "number" }).default(sql`'0'`).notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  spanCountSinceReset: bigint("span_count_since_reset", { mode: "number" }).default(sql`'0'`).notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  prevSpanCount: bigint("prev_span_count", { mode: "number" }).default(sql`'0'`).notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  eventCount: bigint("event_count", { mode: "number" }).default(sql`'0'`).notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  eventCountSinceReset: bigint("event_count_since_reset", { mode: "number" }).default(sql`'0'`).notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  prevEventCount: bigint("prev_event_count", { mode: "number" }).default(sql`'0'`).notNull(),
  resetTime: timestamp("reset_time", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  resetReason: text("reset_reason").default('signup').notNull(),
}, (table) => [
  foreignKey({
    columns: [table.workspaceId],
    foreignColumns: [workspaces.id],
    name: "user_usage_workspace_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  unique("user_usage_workspace_id_key").on(table.workspaceId),
]);

export const labels = pgTable("labels", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  classId: uuid("class_id").notNull(),
  spanId: uuid("span_id").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  userId: uuid("user_id").defaultRandom(),
  labelSource: labelSource("label_source").default('MANUAL').notNull(),
  reasoning: text(),
  projectId: uuid("project_id").notNull(),
}, (table) => [
  foreignKey({
    columns: [table.classId, table.projectId],
    foreignColumns: [labelClasses.id, labelClasses.projectId],
    name: "labels_class_id_project_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  unique("labels_span_id_class_id_user_id_key").on(table.classId, table.spanId, table.userId),
  unique("labels_span_id_class_id_key").on(table.classId, table.spanId),
]);

export const machines = pgTable("machines", {
  id: uuid().defaultRandom().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  projectId: uuid("project_id").notNull(),
}, (table) => [
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "machines_project_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  primaryKey({ columns: [table.id, table.projectId], name: "machines_pkey" }),
]);

export const datapointToSpan = pgTable("datapoint_to_span", {
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  datapointId: uuid("datapoint_id").notNull(),
  spanId: uuid("span_id").notNull(),
  projectId: uuid("project_id").notNull(),
}, (table) => [
  foreignKey({
    columns: [table.datapointId],
    foreignColumns: [datasetDatapoints.id],
    name: "datapoint_to_span_datapoint_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  foreignKey({
    columns: [table.spanId, table.projectId],
    foreignColumns: [spans.spanId, spans.projectId],
    name: "datapoint_to_span_span_id_project_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  primaryKey({ columns: [table.datapointId, table.spanId, table.projectId], name: "datapoint_to_span_pkey" }),
]);

export const spans = pgTable("spans", {
  spanId: uuid("span_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  parentSpanId: uuid("parent_span_id"),
  name: text().notNull(),
  attributes: jsonb(),
  input: jsonb(),
  output: jsonb(),
  spanType: spanType("span_type").notNull(),
  startTime: timestamp("start_time", { withTimezone: true, mode: 'string' }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true, mode: 'string' }).notNull(),
  traceId: uuid("trace_id").notNull(),
  inputPreview: text("input_preview"),
  outputPreview: text("output_preview"),
  projectId: uuid("project_id").notNull(),
  inputUrl: text("input_url"),
  outputUrl: text("output_url"),
}, (table) => [
  index("span_path_idx").using("btree", sql`(attributes -> 'lmnr.span.path'::text)`),
  index("spans_project_id_idx").using("hash", table.projectId.asc().nullsLast().op("uuid_ops")),
  index("spans_project_id_trace_id_start_time_idx").using("btree", table.projectId.asc().nullsLast().op("timestamptz_ops"), table.traceId.asc().nullsLast().op("uuid_ops"), table.startTime.asc().nullsLast().op("timestamptz_ops")),
  index("spans_root_project_id_start_time_end_time_trace_id_idx").using("btree", table.projectId.asc().nullsLast().op("uuid_ops"), table.startTime.asc().nullsLast().op("timestamptz_ops"), table.endTime.asc().nullsLast().op("timestamptz_ops"), table.traceId.asc().nullsLast().op("uuid_ops")).where(sql`(parent_span_id IS NULL)`),
  index("spans_start_time_end_time_idx").using("btree", table.startTime.asc().nullsLast().op("timestamptz_ops"), table.endTime.asc().nullsLast().op("timestamptz_ops")),
  index("spans_trace_id_idx").using("btree", table.traceId.asc().nullsLast().op("uuid_ops")),
  index("spans_trace_id_start_time_idx").using("btree", table.traceId.asc().nullsLast().op("uuid_ops"), table.startTime.asc().nullsLast().op("uuid_ops")),
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "spans_project_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  primaryKey({ columns: [table.spanId, table.projectId], name: "spans_pkey" }),
  unique("unique_span_id_project_id").on(table.spanId, table.projectId),
  pgPolicy("select_by_next_api_key", { as: "permissive", for: "select", to: ["public"], using: sql`is_project_id_accessible_for_api_key(api_key(), project_id)` }),
]);
