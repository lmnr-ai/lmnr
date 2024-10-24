import { pgTable, uuid, timestamp, text, doublePrecision, jsonb, foreignKey, unique, index, bigint, boolean, integer, pgEnum } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const eventSource = pgEnum("event_source", ['AUTO', 'MANUAL', 'CODE']);
export const eventType = pgEnum("event_type", ['BOOLEAN', 'STRING', 'NUMBER']);
export const labelJobStatus = pgEnum("label_job_status", ['RUNNING', 'DONE']);
export const labelSource = pgEnum("label_source", ['MANUAL', 'AUTO']);
export const labelType = pgEnum("label_type", ['BOOLEAN', 'CATEGORICAL']);
export const spanType = pgEnum("span_type", ['DEFAULT', 'LLM', 'PIPELINE', 'EXECUTOR', 'EVALUATOR', 'EVALUATION']);
export const traceType = pgEnum("trace_type", ['DEFAULT', 'EVENT', 'EVALUATION']);
export const workspaceRole = pgEnum("workspace_role", ['member', 'owner']);



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

export const labelClasses = pgTable("label_classes", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  name: text().notNull(),
  projectId: uuid("project_id").notNull(),
  labelType: labelType("label_type").notNull(),
  valueMap: jsonb("value_map").default([false,true]).notNull(),
  description: text(),
  evaluatorRunnableGraph: jsonb("evaluator_runnable_graph"),
  pipelineVersionId: uuid("pipeline_version_id"),
},
(table) => ({
  labelClassesProjectIdFkey: foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "label_classes_project_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
}));

export const eventTemplates = pgTable("event_templates", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  name: text().notNull(),
  projectId: uuid("project_id").notNull(),
  eventType: eventType("event_type").default('BOOLEAN').notNull(),
},
(table) => ({
  eventTemplatesProjectIdFkey: foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "event_templates_project_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  uniqueNameProjectId: unique("unique_name_project_id").on(table.name, table.projectId),
}));

export const labelClassesForPath = pgTable("label_classes_for_path", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  projectId: uuid("project_id").defaultRandom().notNull(),
  path: text().notNull(),
  labelClassId: uuid("label_class_id").notNull(),
},
(table) => ({
  autoevalLabelsProjectIdFkey: foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "autoeval_labels_project_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  uniqueProjectIdPathLabelClass: unique("unique_project_id_path_label_class").on(table.projectId, table.path, table.labelClassId),
}));

export const membersOfWorkspaces = pgTable("members_of_workspaces", {
  workspaceId: uuid("workspace_id").notNull(),
  userId: uuid("user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  id: uuid().defaultRandom().primaryKey().notNull(),
  memberRole: workspaceRole("member_role").default('owner').notNull(),
},
(table) => ({
  userIdIdx: index("members_of_workspaces_user_id_idx").using("btree", table.userId.asc().nullsLast()),
  membersOfWorkspacesUserIdFkey: foreignKey({
    columns: [table.userId],
    foreignColumns: [users.id],
    name: "members_of_workspaces_user_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  publicMembersOfWorkspacesWorkspaceIdFkey: foreignKey({
    columns: [table.workspaceId],
    foreignColumns: [workspaces.id],
    name: "public_members_of_workspaces_workspace_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  membersOfWorkspacesUserWorkspaceUnique: unique("members_of_workspaces_user_workspace_unique").on(table.workspaceId, table.userId),
}));

export const pipelineVersions = pgTable("pipeline_versions", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  pipelineId: uuid("pipeline_id").notNull(),
  displayableGraph: jsonb("displayable_graph").notNull(),
  runnableGraph: jsonb("runnable_graph").notNull(),
  pipelineType: text("pipeline_type").notNull(),
  name: text().notNull(),
});

export const apiKeys = pgTable("api_keys", {
  apiKey: text("api_key").primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  userId: uuid("user_id").notNull(),
  name: text().default('default').notNull(),
},
(table) => ({
  apiKeysUserIdFkey: foreignKey({
    columns: [table.userId],
    foreignColumns: [users.id],
    name: "api_keys_user_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
}));

export const evaluations = pgTable("evaluations", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  projectId: uuid("project_id").notNull(),
  name: text().notNull(),
  metadata: jsonb(),
  scoreNames: jsonb("score_names").default([]).notNull(),
  averageScores: jsonb("average_scores"),
  groupId: text("group_id").default('default').notNull(),
},
(table) => ({
  evaluationsProjectIdFkey1: foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "evaluations_project_id_fkey1"
  }).onUpdate("cascade").onDelete("cascade"),
}));

export const datasets = pgTable("datasets", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  name: text().notNull(),
  projectId: uuid("project_id").defaultRandom().notNull(),
  indexedOn: text("indexed_on"),
},
(table) => ({
  publicDatasetsProjectIdFkey: foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "public_datasets_project_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
}));

export const projects = pgTable("projects", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  name: text().notNull(),
  workspaceId: uuid("workspace_id").notNull(),
},
(table) => ({
  workspaceIdIdx: index("projects_workspace_id_idx").using("btree", table.workspaceId.asc().nullsLast()),
  projectsWorkspaceIdFkey: foreignKey({
    columns: [table.workspaceId],
    foreignColumns: [workspaces.id],
    name: "projects_workspace_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
}));

export const pipelines = pgTable("pipelines", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  projectId: uuid("project_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  name: text().notNull(),
  visibility: text().default('PRIVATE').notNull(),
  pythonRequirements: text("python_requirements").default('').notNull(),
},
(table) => ({
  nameProjectIdIdx: index("pipelines_name_project_id_idx").using("btree", table.name.asc().nullsLast(), table.projectId.asc().nullsLast()),
  projectIdIdx: index("pipelines_project_id_idx").using("btree", table.projectId.asc().nullsLast()),
  pipelinesProjectIdFkey: foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "pipelines_project_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  uniqueProjectIdPipelineName: unique("unique_project_id_pipeline_name").on(table.projectId, table.name),
}));

export const providerApiKeys = pgTable("provider_api_keys", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  name: text().notNull(),
  projectId: uuid("project_id").defaultRandom().notNull(),
  nonceHex: text("nonce_hex").notNull(),
  value: text().notNull(),
},
(table) => ({
  providerApiKeysProjectIdFkey: foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "provider_api_keys_project_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
}));

export const targetPipelineVersions = pgTable("target_pipeline_versions", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  pipelineId: uuid("pipeline_id").notNull(),
  pipelineVersionId: uuid("pipeline_version_id").notNull(),
},
(table) => ({
  targetPipelineVersionsPipelineIdFkey: foreignKey({
    columns: [table.pipelineId],
    foreignColumns: [pipelines.id],
    name: "target_pipeline_versions_pipeline_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  targetPipelineVersionsPipelineVersionIdFkey: foreignKey({
    columns: [table.pipelineVersionId],
    foreignColumns: [pipelineVersions.id],
    name: "target_pipeline_versions_pipeline_version_id_fkey"
  }),
  uniquePipelineId: unique("unique_pipeline_id").on(table.pipelineId),
}));

export const workspaces = pgTable("workspaces", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  name: text().notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  tierId: bigint("tier_id", { mode: "number" }).default(sql`'1'`).notNull(),
  subscriptionId: text("subscription_id").default('').notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  additionalSeats: bigint("additional_seats", { mode: "number" }).default(sql`'0'`).notNull(),
},
(table) => ({
  workspacesTierIdFkey: foreignKey({
    columns: [table.tierId],
    foreignColumns: [subscriptionTiers.id],
    name: "workspaces_tier_id_fkey"
  }).onUpdate("cascade"),
}));

export const userSubscriptionInfo = pgTable("user_subscription_info", {
  userId: uuid("user_id").defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  stripeCustomerId: text("stripe_customer_id").notNull(),
  activated: boolean().default(false).notNull(),
},
(table) => ({
  stripeCustomerIdIdx: index("user_subscription_info_stripe_customer_id_idx").using("btree", table.stripeCustomerId.asc().nullsLast()),
  userSubscriptionInfoFkey: foreignKey({
    columns: [table.userId],
    foreignColumns: [users.id],
    name: "user_subscription_info_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
}));

export const datasetDatapoints = pgTable("dataset_datapoints", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  datasetId: uuid("dataset_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  data: jsonb().notNull(),
  indexedOn: text("indexed_on"),
  target: jsonb().default({}).notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  indexInBatch: bigint("index_in_batch", { mode: "number" }),
  metadata: jsonb(),
},
(table) => ({
  datasetDatapointsDatasetIdFkey: foreignKey({
    columns: [table.datasetId],
    foreignColumns: [datasets.id],
    name: "dataset_datapoints_dataset_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
}));

export const evaluationResults = pgTable("evaluation_results", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  evaluationId: uuid("evaluation_id").notNull(),
  data: jsonb().notNull(),
  target: jsonb().default({}).notNull(),
  executorOutput: jsonb("executor_output"),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  indexInBatch: bigint("index_in_batch", { mode: "number" }),
  error: jsonb(),
  scores: jsonb().notNull(),
  traceId: uuid("trace_id").notNull(),
},
(table) => ({
  evaluationIdIdx: index("evaluation_results_evaluation_id_idx").using("btree", table.evaluationId.asc().nullsLast()),
  evaluationResultsEvaluationIdFkey1: foreignKey({
    columns: [table.evaluationId],
    foreignColumns: [evaluations.id],
    name: "evaluation_results_evaluation_id_fkey1"
  }).onUpdate("cascade").onDelete("cascade"),
}));

export const events = pgTable("events", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  spanId: uuid("span_id").notNull(),
  timestamp: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
  templateId: uuid("template_id").notNull(),
  source: eventSource().notNull(),
  metadata: jsonb(),
  value: jsonb().notNull(),
  data: text(),
  inputs: jsonb(),
},
(table) => ({
  eventsTemplateIdFkey: foreignKey({
    columns: [table.templateId],
    foreignColumns: [eventTemplates.id],
    name: "events_template_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
}));

export const labels = pgTable("labels", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  classId: uuid("class_id").notNull(),
  value: doublePrecision().default(sql`'0'`),
  spanId: uuid("span_id").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  userId: uuid("user_id").defaultRandom(),
  labelSource: labelSource("label_source").default('MANUAL').notNull(),
  jobStatus: labelJobStatus("job_status"),
  reasoning: text(),
},
(table) => ({
  traceTagsSpanIdFkey: foreignKey({
    columns: [table.spanId],
    foreignColumns: [spans.spanId],
    name: "trace_tags_span_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  traceTagsTypeIdFkey: foreignKey({
    columns: [table.classId],
    foreignColumns: [labelClasses.id],
    name: "trace_tags_type_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  labelsSpanIdClassIdUserIdKey: unique("labels_span_id_class_id_user_id_key").on(table.classId, table.spanId, table.userId),
}));

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

export const projectApiKeys = pgTable("project_api_keys", {
  value: text().default('').notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  name: text(),
  projectId: uuid("project_id").notNull(),
  shorthand: text().default('').notNull(),
  hash: text().default('').notNull(),
  id: uuid().defaultRandom().primaryKey().notNull(),
},
(table) => ({
  publicProjectApiKeysProjectIdFkey: foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "public_project_api_keys_project_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
}));

export const spans = pgTable("spans", {
  spanId: uuid("span_id").primaryKey().notNull(),
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
  version: text().notNull(),
  inputPreview: text("input_preview"),
  outputPreview: text("output_preview"),
},
(table) => ({
  spanPathIdx: index("span_path_idx").using("btree", sql`(attributes -> 'lmnr.span.path'::text)`),
  startTimeEndTimeIdx: index("spans_start_time_end_time_idx").using("btree", table.startTime.asc().nullsLast(), table.endTime.asc().nullsLast()),
  textsearchInputPlusOutputEnglish: index("spans_textsearch_input_plus_output_english").using("gin", sql`to_tsvector('english'::regconfig`).where(sql`(start_time > '2024-10-05 00:00:00+00'::timestamp with time zone)`),
  traceIdIdx: index("spans_trace_id_idx").using("btree", table.traceId.asc().nullsLast()),
  newSpansTraceIdFkey: foreignKey({
    columns: [table.traceId],
    foreignColumns: [traces.id],
    name: "new_spans_trace_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
}));

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
},
(table) => ({
  userUsageWorkspaceIdFkey: foreignKey({
    columns: [table.workspaceId],
    foreignColumns: [workspaces.id],
    name: "user_usage_workspace_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
  userUsageWorkspaceIdKey: unique("user_usage_workspace_id_key").on(table.workspaceId),
}));

export const traces = pgTable("traces", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  version: text().notNull(),
  release: text(),
  userId: text("user_id"),
  sessionId: text("session_id"),
  metadata: jsonb(),
  projectId: uuid("project_id").notNull(),
  endTime: timestamp("end_time", { withTimezone: true, mode: 'string' }),
  startTime: timestamp("start_time", { withTimezone: true, mode: 'string' }),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  totalTokenCount: bigint("total_token_count", { mode: "number" }).default(sql`'0'`).notNull(),
  success: boolean().default(true).notNull(),
  cost: doublePrecision().default(sql`'0'`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  traceType: traceType("trace_type").default('DEFAULT').notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  inputTokenCount: bigint("input_token_count", { mode: "number" }).default(sql`'0'`).notNull(),
  // You can use { mode: "bigint" } if numbers are exceeding js number limitations
  outputTokenCount: bigint("output_token_count", { mode: "number" }).default(sql`'0'`).notNull(),
  inputCost: doublePrecision("input_cost").default(sql`'0'`).notNull(),
  outputCost: doublePrecision("output_cost").default(sql`'0'`).notNull(),
},
(table) => ({
  projectIdIdx: index("traces_project_id_idx").using("btree", table.projectId.asc().nullsLast()),
  sessionIdIdx: index("traces_session_id_idx").using("btree", table.sessionId.asc().nullsLast()),
  startTimeEndTimeIdx: index("traces_start_time_end_time_idx").using("btree", table.startTime.asc().nullsLast(), table.endTime.asc().nullsLast()),
  newTracesProjectIdFkey: foreignKey({
    columns: [table.projectId],
    foreignColumns: [projects.id],
    name: "new_traces_project_id_fkey"
  }).onUpdate("cascade").onDelete("cascade"),
}));

export const users = pgTable("users", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  name: text().notNull(),
  email: text().notNull(),
},
(table) => ({
  usersEmailKey: unique("users_email_key").on(table.email),
}));
