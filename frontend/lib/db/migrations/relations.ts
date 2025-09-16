import { relations } from "drizzle-orm/relations";

import { apiKeys, dashboardCharts, datapointToSpan, datasetDatapoints, datasets, evaluationResults, evaluations, evaluationScores, evaluators, evaluatorScores, evaluatorSpanPaths, labelingQueueItems, labelingQueues, membersOfWorkspaces, playgrounds, projectApiKeys, projects, providerApiKeys, renderTemplates, sharedPayloads, spans,sqlTemplates, subscriptionTiers, tagClasses, tags, traces, tracesAgentChats, tracesAgentMessages, tracesSummaries, users, userSubscriptionInfo, workspaceInvitations, workspaces, workspaceUsage } from "./schema";

export const datasetsRelations = relations(datasets, ({one, many}) => ({
  project: one(projects, {
    fields: [datasets.projectId],
    references: [projects.id]
  }),
  datasetDatapoints: many(datasetDatapoints),
}));

export const projectsRelations = relations(projects, ({one, many}) => ({
  datasets: many(datasets),
  workspace: one(workspaces, {
    fields: [projects.workspaceId],
    references: [workspaces.id]
  }),
  projectApiKeys: many(projectApiKeys),
  providerApiKeys: many(providerApiKeys),
  labelingQueues: many(labelingQueues),
  evaluations: many(evaluations),
  renderTemplates: many(renderTemplates),
  tagClasses: many(tagClasses),
  playgrounds: many(playgrounds),
  evaluatorScores: many(evaluatorScores),
  evaluators: many(evaluators),
  evaluatorSpanPaths: many(evaluatorSpanPaths),
  sharedPayloads: many(sharedPayloads),
  sqlTemplates: many(sqlTemplates),
  traces: many(traces),
  dashboardCharts: many(dashboardCharts),
  tracesAgentChats: many(tracesAgentChats),
  tracesAgentMessages: many(tracesAgentMessages),
  tracesSummaries: many(tracesSummaries),
  spans: many(spans),
}));

export const datasetDatapointsRelations = relations(datasetDatapoints, ({one, many}) => ({
  dataset: one(datasets, {
    fields: [datasetDatapoints.datasetId],
    references: [datasets.id]
  }),
  datapointToSpans: many(datapointToSpan),
}));

export const workspacesRelations = relations(workspaces, ({one, many}) => ({
  projects: many(projects),
  membersOfWorkspaces: many(membersOfWorkspaces),
  subscriptionTier: one(subscriptionTiers, {
    fields: [workspaces.tierId],
    references: [subscriptionTiers.id]
  }),
  workspaceInvitations: many(workspaceInvitations),
  workspaceUsages: many(workspaceUsage),
}));

export const membersOfWorkspacesRelations = relations(membersOfWorkspaces, ({one}) => ({
  user: one(users, {
    fields: [membersOfWorkspaces.userId],
    references: [users.id]
  }),
  workspace: one(workspaces, {
    fields: [membersOfWorkspaces.workspaceId],
    references: [workspaces.id]
  }),
}));

export const usersRelations = relations(users, ({many}) => ({
  membersOfWorkspaces: many(membersOfWorkspaces),
  userSubscriptionInfos: many(userSubscriptionInfo),
  apiKeys: many(apiKeys),
}));

export const projectApiKeysRelations = relations(projectApiKeys, ({one}) => ({
  project: one(projects, {
    fields: [projectApiKeys.projectId],
    references: [projects.id]
  }),
}));

export const providerApiKeysRelations = relations(providerApiKeys, ({one}) => ({
  project: one(projects, {
    fields: [providerApiKeys.projectId],
    references: [projects.id]
  }),
}));

export const userSubscriptionInfoRelations = relations(userSubscriptionInfo, ({one}) => ({
  user: one(users, {
    fields: [userSubscriptionInfo.userId],
    references: [users.id]
  }),
}));

export const subscriptionTiersRelations = relations(subscriptionTiers, ({many}) => ({
  workspaces: many(workspaces),
}));

export const labelingQueuesRelations = relations(labelingQueues, ({one, many}) => ({
  project: one(projects, {
    fields: [labelingQueues.projectId],
    references: [projects.id]
  }),
  labelingQueueItems: many(labelingQueueItems),
}));

export const evaluationScoresRelations = relations(evaluationScores, ({one}) => ({
  evaluationResult: one(evaluationResults, {
    fields: [evaluationScores.resultId],
    references: [evaluationResults.id]
  }),
}));

export const evaluationResultsRelations = relations(evaluationResults, ({one, many}) => ({
  evaluationScores: many(evaluationScores),
  evaluation: one(evaluations, {
    fields: [evaluationResults.evaluationId],
    references: [evaluations.id]
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({one}) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id]
  }),
}));

export const evaluationsRelations = relations(evaluations, ({one, many}) => ({
  project: one(projects, {
    fields: [evaluations.projectId],
    references: [projects.id]
  }),
  evaluationResults: many(evaluationResults),
}));

export const renderTemplatesRelations = relations(renderTemplates, ({one}) => ({
  project: one(projects, {
    fields: [renderTemplates.projectId],
    references: [projects.id]
  }),
}));

export const tagClassesRelations = relations(tagClasses, ({one, many}) => ({
  project: one(projects, {
    fields: [tagClasses.projectId],
    references: [projects.id]
  }),
  tags: many(tags),
}));

export const tagsRelations = relations(tags, ({one}) => ({
  tagClass: one(tagClasses, {
    fields: [tags.classId],
    references: [tagClasses.id]
  }),
}));

export const playgroundsRelations = relations(playgrounds, ({one}) => ({
  project: one(projects, {
    fields: [playgrounds.projectId],
    references: [projects.id]
  }),
}));

export const workspaceInvitationsRelations = relations(workspaceInvitations, ({one}) => ({
  workspace: one(workspaces, {
    fields: [workspaceInvitations.workspaceId],
    references: [workspaces.id]
  }),
}));

export const evaluatorScoresRelations = relations(evaluatorScores, ({one}) => ({
  project: one(projects, {
    fields: [evaluatorScores.projectId],
    references: [projects.id]
  }),
}));

export const evaluatorsRelations = relations(evaluators, ({one, many}) => ({
  project: one(projects, {
    fields: [evaluators.projectId],
    references: [projects.id]
  }),
  evaluatorSpanPaths: many(evaluatorSpanPaths),
}));

export const evaluatorSpanPathsRelations = relations(evaluatorSpanPaths, ({one}) => ({
  evaluator: one(evaluators, {
    fields: [evaluatorSpanPaths.evaluatorId],
    references: [evaluators.id]
  }),
  project: one(projects, {
    fields: [evaluatorSpanPaths.projectId],
    references: [projects.id]
  }),
}));

export const sharedPayloadsRelations = relations(sharedPayloads, ({one}) => ({
  project: one(projects, {
    fields: [sharedPayloads.projectId],
    references: [projects.id]
  }),
}));

export const labelingQueueItemsRelations = relations(labelingQueueItems, ({one}) => ({
  labelingQueue: one(labelingQueues, {
    fields: [labelingQueueItems.queueId],
    references: [labelingQueues.id]
  }),
}));

export const workspaceUsageRelations = relations(workspaceUsage, ({one}) => ({
  workspace: one(workspaces, {
    fields: [workspaceUsage.workspaceId],
    references: [workspaces.id]
  }),
}));

export const sqlTemplatesRelations = relations(sqlTemplates, ({one}) => ({
  project: one(projects, {
    fields: [sqlTemplates.projectId],
    references: [projects.id]
  }),
}));

export const tracesRelations = relations(traces, ({one, many}) => ({
  project: one(projects, {
    fields: [traces.projectId],
    references: [projects.id]
  }),
  tracesSummaries: many(tracesSummaries),
}));

export const dashboardChartsRelations = relations(dashboardCharts, ({one}) => ({
  project: one(projects, {
    fields: [dashboardCharts.projectId],
    references: [projects.id]
  }),
}));

export const tracesAgentChatsRelations = relations(tracesAgentChats, ({one}) => ({
  project: one(projects, {
    fields: [tracesAgentChats.projectId],
    references: [projects.id]
  }),
}));

export const tracesAgentMessagesRelations = relations(tracesAgentMessages, ({one}) => ({
  project: one(projects, {
    fields: [tracesAgentMessages.projectId],
    references: [projects.id]
  }),
}));

export const tracesSummariesRelations = relations(tracesSummaries, ({one}) => ({
  project: one(projects, {
    fields: [tracesSummaries.projectId],
    references: [projects.id]
  }),
  trace: one(traces, {
    fields: [tracesSummaries.traceId],
    references: [traces.id]
  }),
}));

export const datapointToSpanRelations = relations(datapointToSpan, ({one}) => ({
  datasetDatapoint: one(datasetDatapoints, {
    fields: [datapointToSpan.datapointId],
    references: [datasetDatapoints.id]
  }),
  span: one(spans, {
    fields: [datapointToSpan.spanId],
    references: [spans.spanId]
  }),
}));

export const spansRelations = relations(spans, ({one, many}) => ({
  datapointToSpans: many(datapointToSpan),
  project: one(projects, {
    fields: [spans.projectId],
    references: [projects.id]
  }),
}));
