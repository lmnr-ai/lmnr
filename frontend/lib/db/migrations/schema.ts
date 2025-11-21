import { sql } from "drizzle-orm";
import { bigint, boolean, doublePrecision, foreignKey, index, integer, jsonb, pgEnum,pgPolicy, pgTable, primaryKey, real, smallint, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const agentMachineStatus = pgEnum("agent_machine_status", ['not_started', 'running', 'paused', 'stopped']);
export const agentMessageType = pgEnum("agent_message_type", ['user', 'assistant', 'step', 'error']);
export const spanType = pgEnum("span_type", ['DEFAULT', 'LLM', 'PIPELINE', 'EXECUTOR', 'EVALUATOR', 'EVALUATION', 'TOOL', 'HUMAN_EVALUATOR', 'EVENT']);
export const tagSource = pgEnum("tag_source", ['MANUAL', 'AUTO', 'CODE']);
export const traceType = pgEnum("trace_type", ['DEFAULT', 'EVENT', 'EVALUATION', 'PLAYGROUND']);
export const workspaceRole = pgEnum("workspace_role", ['member', 'owner', 'admin']);


export const datasetParquets = pgTable("dataset_parquets", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  datasetId: uuid("dataset_id").notNull(),
  parquetPath: text("parquet_path").notNull(),
  jobId: uuid("job_id").notNull(),
  name: text(),
  projectId: uuid("project_id").notNull(),
}, (table) => [
  foreignKey({
    columns: [table.datasetId],
    foreignColumns: [datasets.id],
    name: "dataset_parquets_dataset_id_fkey"
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "dataset_parquets_project_id_fkey"
  }).onDelete("cascade"),
]);

export const agentChats = pgTable("agent_chats", {
  sessionId: uuid("session_id").defaultRandom().primaryKey().notNull(),
  chatName: text("chat_name").default('New chat').notNull(),
  userId: uuid("user_id").notNull(),
  machineStatus: agentMachineStatus("machine_status").default('not_started'),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  agentStatus: text("agent_status").default('idle').notNull(),
}, (table) => [
  index("agent_chats_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
  index("agent_chats_updated_at_idx").using("btree", table.updatedAt.asc().nullsLast().op("timestamptz_ops")),
  index("agent_chats_user_id_idx").using("hash", table.userId.asc().nullsLast().op("uuid_ops")),
  foreignKey({
    columns: [table.sessionId],
    foreignColumns: [agentSessions.sessionId],
    name: "agent_chats_session_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [users.id],
    name: "agent_chats_user_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  pgPolicy("select_by_next_api_key", { as: "permissive", for: "select", to: ["authenticated"], using: sql`is_user_id_accessible_for_api_key(api_key(), user_id)` }),
]);

export const userUsage = pgTable("user_usage", {
  userId: uuid("user_id").defaultRandom().primaryKey().notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  indexChatMessageCount: bigint("index_chat_message_count", { mode: "number" }).default(sql`'0'`).notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  indexChatMessageCountSinceReset: bigint("index_chat_message_count_since_reset", { mode: "number" }).default(sql`'0'`).notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  prevIndexChatMessageCount: bigint("prev_index_chat_message_count", { mode: "number" }).default(sql`'0'`).notNull(),
  resetTime: timestamp("reset_time", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  resetReason: text("reset_reason").default('signup').notNull(),
}, (table) => [
  foreignKey({
    columns: [table.userId],
    foreignColumns: [users.id],
    name: "user_usage_user_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
]);

export const tracesAgentMessages = pgTable("traces_agent_messages", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  role: text().notNull(),
  parts: jsonb().notNull(),
  chatId: uuid("chat_id").notNull(),
  traceId: uuid("trace_id").notNull(),
  projectId: uuid("project_id").notNull(),
}, (table) => [
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "traces_agent_messages_project_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
]);

export const userSubscriptionTiers = pgTable("user_subscription_tiers", {
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "user_subscription_tiers_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  name: text().notNull(),
  stripeProductId: text("stripe_product_id").default('').notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  indexChatMessages: bigint("index_chat_messages", { mode: "number" }).default(sql`'0'`),
});

export const evaluators = pgTable("evaluators", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  projectId: uuid("project_id").notNull(),
  name: text().notNull(),
  evaluatorType: text("evaluator_type").notNull(),
  definition: jsonb().default({}),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "evaluators_project_id_fkey"
  }).onDelete("cascade"),
]);

export const evaluatorSpanPaths = pgTable("evaluator_span_paths", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  evaluatorId: uuid("evaluator_id").notNull(),
  spanPath: jsonb("span_path").default({}),
  projectId: uuid("project_id").notNull(),
}, (table) => [
  foreignKey({
    columns: [table.evaluatorId],
    foreignColumns: [evaluators.id],
    name: "evaluator_span_paths_evaluator_id_fkey"
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "evaluator_span_paths_project_id_fkey"
  }).onDelete("cascade"),
]);

export const evaluatorScores = pgTable("evaluator_scores", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  evaluatorId: uuid("evaluator_id"),
  spanId: uuid("span_id").notNull(),
  score: doublePrecision().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  projectId: uuid("project_id").notNull(),
  name: text().notNull(),
  source: text().notNull(),
  metadata: jsonb().default({}),
}, (table) => [
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "evaluator_scores_project_id_fkey"
  }).onDelete("cascade"),
]);

export const slackIntegrations = pgTable("slack_integrations", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  projectId: uuid("project_id").notNull(),
  token: text().notNull(),
  teamId: text("team_id").notNull(),
  teamName: text("team_name"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  nonceHex: text("nonce_hex").notNull(),
}, (table) => [
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "slack_integrations_project_id_fkey"
  }).onDelete("cascade"),
  unique("slack_integrations_project_id_key").on(table.projectId),
]);

export const workspaceInvitations = pgTable("workspace_invitations", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  workspaceId: uuid("workspace_id").defaultRandom().notNull(),
  email: text().default('').notNull(),
}, (table) => [
  foreignKey({
    columns: [table.workspaceId],
    foreignColumns: [workspaces.id],
    name: "workspace_invitations_workspace_id_fkey"
  }).onDelete("cascade"),
]);

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

export const tracesAgentChats = pgTable("traces_agent_chats", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  traceId: uuid("trace_id").notNull(),
  projectId: uuid("project_id").notNull(),
}, (table) => [
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "traces_agent_chats_project_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
]);

export const labelingQueueItems = pgTable("labeling_queue_items", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  queueId: uuid("queue_id").defaultRandom().notNull(),
  metadata: jsonb().default({}),
  payload: jsonb().default({}),
}, (table) => [
  foreignKey({
    columns: [table.queueId],
    foreignColumns: [labelingQueues.id],
    name: "labelling_queue_items_queue_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
]);

export const agentSessions = pgTable("agent_sessions", {
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  sessionId: uuid("session_id").defaultRandom().primaryKey().notNull(),
  cdpUrl: text("cdp_url"),
  vncUrl: text("vnc_url"),
  machineId: text("machine_id"),
  state: text(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  agentStatus: text("agent_status").default('idle').notNull(),
}, (table) => [
  index("agent_sessions_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
  index("agent_sessions_updated_at_idx").using("btree", table.updatedAt.asc().nullsLast().op("timestamptz_ops")),
]);

export const agentMessages = pgTable("agent_messages", {
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  id: uuid().defaultRandom().primaryKey().notNull(),
  sessionId: uuid("session_id").notNull(),
  content: jsonb().default({}),
  messageType: agentMessageType("message_type").notNull(),
  traceId: uuid("trace_id"),
}, (table) => [
  index("agent_messages_session_id_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops"), table.sessionId.asc().nullsLast().op("timestamptz_ops")),
  foreignKey({
    columns: [table.sessionId],
    foreignColumns: [agentSessions.sessionId],
    name: "agent_messages_session_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
]);

export const summaryTriggerSpans = pgTable("summary_trigger_spans", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  spanName: text("span_name").notNull(),
  eventName: text("event_name"),
  projectId: uuid("project_id").notNull(),
}, (table) => [
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "summary_trigger_spans_project_id_fkey"
  }).onDelete("cascade"),
]);

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
  pgPolicy("Enable insert for authenticated users only", { as: "permissive", for: "all", to: ["service_role"], using: sql`true`, withCheck: sql`true`  }),
]);

export const labelingQueues = pgTable("labeling_queues", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  name: text().notNull(),
  projectId: uuid("project_id").notNull(),
  annotationSchema: jsonb("annotation_schema"),
}, (table) => [
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "labeling_queues_project_id_fkey"
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
  index("events_span_id_idx").using("btree", table.spanId.asc().nullsLast().op("uuid_ops")),
  index("events_span_id_project_id_idx").using("btree", table.projectId.asc().nullsLast().op("uuid_ops"), table.spanId.asc().nullsLast().op("uuid_ops")),
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

export const evaluationScores = pgTable("evaluation_scores", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  resultId: uuid("result_id").defaultRandom().notNull(),
  name: text().default('').notNull(),
  score: doublePrecision(),
  labelId: uuid("label_id"),
}, (table) => [
  index("evaluation_scores_result_id_idx").using("hash", table.resultId.asc().nullsLast().op("uuid_ops")),
  foreignKey({
    columns: [table.resultId],
    foreignColumns: [evaluationResults.id],
    name: "evaluation_scores_result_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  unique("evaluation_scores_names_unique_idx").on(table.resultId, table.name),
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
    name: "datasets_project_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
]);

export const workspaces = pgTable("workspaces", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  name: text().notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  tierId: bigint("tier_id", { mode: "number" }).default(sql`'1'`).notNull(),
  subscriptionId: text("subscription_id"),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  additionalSeats: bigint("additional_seats", { mode: "number" }).default(sql`'0'`).notNull(),
  resetTime: timestamp("reset_time", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.tierId],
    foreignColumns: [subscriptionTiers.id],
    name: "workspaces_tier_id_fkey"
  }).onUpdate("cascade"),
]);

export const users = pgTable("users", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  name: text().notNull(),
  email: text().notNull(),
  subscriptionId: text("subscription_id"),
  avatarUrl: text("avatar_url"),
}, (table) => [
  unique("users_email_key").on(table.email),
  pgPolicy("Enable insert for authenticated users only", { as: "permissive", for: "insert", to: ["service_role"], withCheck: sql`true`  }),
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
  stripeProductId: text("stripe_product_id").default('').notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  steps: bigint({ mode: "number" }).default(sql`'0'`).notNull(),
  extraStepPrice: doublePrecision("extra_step_price").default(sql`'0'`).notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  bytesIngested: bigint("bytes_ingested", { mode: "number" }).default(sql`'0'`).notNull(),
  extraBytePrice: doublePrecision("extra_byte_price").default(sql`'0'`).notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  spans: bigint({ mode: "number" }),
  extraSpanPrice: doublePrecision("extra_span_price"),
});

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

export const sharedTraces = pgTable("shared_traces", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  projectId: uuid("project_id").defaultRandom().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "shared_traces_project_id_fkey"
  }).onDelete("cascade"),
]);

export const datasetExportJobs = pgTable("dataset_export_jobs", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  datasetId: uuid("dataset_id").notNull(),
  projectId: uuid("project_id").notNull(),
  status: text().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.datasetId],
    foreignColumns: [datasets.id],
    name: "dataset_export_jobs_dataset_id_fkey"
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "dataset_export_jobs_project_id_fkey"
  }).onDelete("cascade"),
  unique("dataset_export_jobs_project_dataset_key").on(table.datasetId, table.projectId),
]);

export const tracesSummaries = pgTable("traces_summaries", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  traceId: uuid("trace_id").defaultRandom().notNull(),
  summary: text(),
  projectId: uuid("project_id").notNull(),
  spanIdsMap: jsonb("span_ids_map"),
}, (table) => [
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "traces_summaries_project_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
]);

export const slackChannelToEvents = pgTable("slack_channel_to_events", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  channelId: text("channel_id").notNull(),
  projectId: uuid("project_id").notNull(),
  eventName: text("event_name").notNull(),
  integrationId: uuid("integration_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.integrationId],
    foreignColumns: [slackIntegrations.id],
    name: "slack_channel_to_events_integration_id_fkey"
  }).onDelete("cascade"),
  unique("slack_channel_to_events_integration_channel_event_key").on(table.channelId, table.eventName, table.integrationId),
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

export const evaluations = pgTable("evaluations", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  projectId: uuid("project_id").notNull(),
  name: text().notNull(),
  groupId: text("group_id").default('default').notNull(),
  metadata: jsonb(),
}, (table) => [
  index("evaluations_project_id_hash_idx").using("hash", table.projectId.asc().nullsLast().op("uuid_ops")),
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "evaluations_project_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  pgPolicy("select_by_next_api_key", { as: "permissive", for: "select", to: ["anon", "authenticated"], using: sql`is_evaluation_id_accessible_for_api_key(api_key(), id)` }),
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
  metadata: jsonb(),
}, (table) => [
  index("evaluation_results_evaluation_id_idx").using("btree", table.evaluationId.asc().nullsLast().op("uuid_ops")),
  foreignKey({
    columns: [table.evaluationId],
    foreignColumns: [evaluations.id],
    name: "evaluation_results_evaluation_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  pgPolicy("select_by_next_api_key", { as: "permissive", for: "select", to: ["anon", "authenticated"], using: sql`is_evaluation_id_accessible_for_api_key(api_key(), evaluation_id)` }),
]);

export const projectApiKeys = pgTable("project_api_keys", {
  value: text().default('').notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  name: text(),
  projectId: uuid("project_id").notNull(),
  shorthand: text().default('').notNull(),
  hash: text().default('').notNull(),
  id: uuid().defaultRandom().primaryKey().notNull(),
  isIngestOnly: boolean("is_ingest_only").default(false).notNull(),
}, (table) => [
  index("project_api_keys_hash_idx").using("hash", table.hash.asc().nullsLast().op("text_ops")),
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "public_project_api_keys_project_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
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
    name: "members_of_workspaces_workspace_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  unique("members_of_workspaces_user_workspace_unique").on(table.workspaceId, table.userId),
]);

export const workspaceUsage = pgTable("workspace_usage", {
  workspaceId: uuid("workspace_id").defaultRandom().primaryKey().notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  spanCount: bigint("span_count", { mode: "number" }).default(sql`'0'`).notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  spanCountSinceReset: bigint("span_count_since_reset", { mode: "number" }).default(sql`'0'`).notNull(),
  resetTime: timestamp("reset_time", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  resetReason: text("reset_reason").default('signup').notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  stepCount: bigint("step_count", { mode: "number" }).default(sql`'0'`).notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  prevStepCount: bigint("prev_step_count", { mode: "number" }).default(sql`'0'`).notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  stepCountSinceReset: bigint("step_count_since_reset", { mode: "number" }).default(sql`'0'`).notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  bytesIngested: bigint("bytes_ingested", { mode: "number" }).default(sql`'0'`).notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  bytesIngestedSinceReset: bigint("bytes_ingested_since_reset", { mode: "number" }).default(sql`'0'`).notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  spansBytesIngested: bigint("spans_bytes_ingested", { mode: "number" }).default(sql`'0'`).notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  spansBytesIngestedSinceReset: bigint("spans_bytes_ingested_since_reset", { mode: "number" }).default(sql`'0'`).notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  browserSessionEventsBytesIngested: bigint("browser_session_events_bytes_ingested", { mode: "number" }).default(sql`'0'`).notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  browserSessionEventsBytesIngestedSinceReset: bigint("browser_session_events_bytes_ingested_since_reset", { mode: "number" }).default(sql`'0'`).notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  prevSpanCount: bigint("prev_span_count", { mode: "number" }).default(sql`'0'`).notNull(),
}, (table) => [
  foreignKey({
    columns: [table.workspaceId],
    foreignColumns: [workspaces.id],
    name: "user_usage_workspace_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
]);

export const tags = pgTable("tags", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  classId: uuid("class_id").notNull(),
  spanId: uuid("span_id").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  userId: uuid("user_id").defaultRandom(),
  source: tagSource().default('MANUAL').notNull(),
  reasoning: text(),
  projectId: uuid("project_id").notNull(),
});

export const sqlTemplates = pgTable("sql_templates", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  name: text().notNull(),
  projectId: uuid("project_id").notNull(),
  query: text().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "sql_templates_project_id_fkey"
  }).onDelete("cascade"),
]);

export const playgrounds = pgTable("playgrounds", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  name: text().notNull(),
  projectId: uuid("project_id").notNull(),
  promptMessages: jsonb("prompt_messages").default([{"role":"user","content":""}]).notNull(),
  modelId: text("model_id").default('').notNull(),
  outputSchema: text("output_schema"),
  maxTokens: integer("max_tokens").default(1024),
  temperature: real().default(sql`'1'`),
  providerOptions: jsonb("provider_options").default({}),
  toolChoice: jsonb("tool_choice").default("none"),
  tools: jsonb().default({}),
}, (table) => [
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "playgrounds_project_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
]);

export const eventDefinitions = pgTable("event_definitions", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  name: text().notNull(),
  prompt: text(),
  projectId: uuid("project_id").notNull(),
  isSemantic: boolean("is_semantic").default(false).notNull(),
  structuredOutput: jsonb("structured_output"),
}, (table) => [
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "event_definitions_project_id_fkey"
  }).onDelete("cascade"),
  unique("event_definitions_project_id_name_key").on(table.name, table.projectId),
]);

export const dashboardCharts = pgTable("dashboard_charts", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  name: text().notNull(),
  query: text().notNull(),
  settings: jsonb().notNull(),
  projectId: uuid("project_id").notNull(),
}, (table) => [
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "dashboard_charts_project_id_fkey"
  }).onDelete("cascade"),
]);

export const sharedPayloads = pgTable("shared_payloads", {
  payloadId: uuid("payload_id").defaultRandom().primaryKey().notNull(),
  projectId: uuid("project_id").defaultRandom().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "shared_payloads_project_id_fkey"
  }).onDelete("cascade"),
]);

export const projectSettings = pgTable("project_settings", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  name: text(),
  value: text(),
  projectId: uuid("project_id").defaultRandom().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "project_settings_project_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
]);

export const tagClasses = pgTable("tag_classes", {
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
    name: "tag_classes_project_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  primaryKey({ columns: [table.name, table.projectId], name: "tag_classes_pkey"}),
  unique("tag_classes_name_project_id_unique").on(table.name, table.projectId),
]);

export const clusters = pgTable("clusters", {
  id: uuid().defaultRandom().notNull(),
  projectId: uuid("project_id").defaultRandom().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
  name: text().notNull(),
  parentId: uuid("parent_id").defaultRandom(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  level: bigint({ mode: "number" }).notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  numChildrenClusters: bigint("num_children_clusters", { mode: "number" }).notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  numTraces: bigint("num_traces", { mode: "number" }).notNull(),
  centroid: doublePrecision().array().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "clusters_project_id_fkey"
  }),
  primaryKey({ columns: [table.id, table.projectId], name: "clusters_pkey"}),
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
  status: text(),
}, (table) => [
  index("spans_name_idx").using("btree", table.name.asc().nullsLast().op("text_ops")),
  index("spans_project_id_start_time_idx").using("btree", table.projectId.asc().nullsLast().op("uuid_ops"), table.startTime.asc().nullsLast().op("timestamptz_ops")),
  index("spans_root_project_id_start_time_trace_id_idx").using("btree", table.projectId.asc().nullsLast().op("uuid_ops"), table.startTime.asc().nullsLast().op("uuid_ops"), table.traceId.asc().nullsLast().op("uuid_ops")).where(sql`(parent_span_id IS NULL)`),
  index("spans_trace_id_start_time_idx").using("btree", table.traceId.asc().nullsLast().op("timestamptz_ops"), table.startTime.asc().nullsLast().op("uuid_ops")),
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "spans_project_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  primaryKey({ columns: [table.spanId, table.projectId], name: "spans_pkey"}),
  pgPolicy("select_by_next_api_key", { as: "permissive", for: "select", to: ["public"], using: sql`is_project_id_accessible_for_api_key(api_key(), project_id)` }),
]);

export const traces = pgTable("traces", {
  id: uuid().defaultRandom().notNull(),
  sessionId: text("session_id"),
  metadata: jsonb(),
  projectId: uuid("project_id").notNull(),
  endTime: timestamp("end_time", { withTimezone: true, mode: 'string' }),
  startTime: timestamp("start_time", { withTimezone: true, mode: 'string' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  totalTokenCount: bigint("total_token_count", { mode: "number" }).default(sql`'0'`).notNull(),
  cost: doublePrecision().default(sql`'0'`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  inputTokenCount: bigint("input_token_count", { mode: "number" }).default(sql`'0'`).notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  outputTokenCount: bigint("output_token_count", { mode: "number" }).default(sql`'0'`).notNull(),
  inputCost: doublePrecision("input_cost").default(sql`'0'`).notNull(),
  outputCost: doublePrecision("output_cost").default(sql`'0'`).notNull(),
  hasBrowserSession: boolean("has_browser_session"),
  topSpanId: uuid("top_span_id"),
  agentSessionId: uuid("agent_session_id"),
  visibility: text().default(''),
  status: text(),
  userId: text("user_id"),
  tags: text().array(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  numSpans: bigint("num_spans", { mode: "number" }),
  topSpanName: text("top_span_name"),
  topSpanType: smallint("top_span_type"),
  traceType: traceType("trace_type"),
  type: smallint(),
}, (table) => [
  index("traces_project_id_idx").using("btree", table.projectId.asc().nullsLast().op("uuid_ops")),
  index("traces_session_id_idx").using("btree", table.sessionId.asc().nullsLast().op("text_ops")),
  foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "new_traces_project_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  primaryKey({ columns: [table.id, table.projectId], name: "traces_pkey"}),
  pgPolicy("select_by_next_api_key", { as: "permissive", for: "select", to: ["anon", "authenticated"], using: sql`is_project_id_accessible_for_api_key(api_key(), project_id)` }),
]);
