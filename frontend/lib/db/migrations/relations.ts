import { relations } from "drizzle-orm/relations";

import { apiKeys, dashboardCharts, datasetDatapoints, datasets, evaluationResults, evaluations, evaluationScores, evaluators, evaluatorScores, evaluatorSpanPaths, eventDefinitions, labelingQueueItems, labelingQueues, membersOfWorkspaces, playgrounds, projectApiKeys, projects, projectSettings, providerApiKeys, renderTemplates, sharedPayloads, sharedTraces, slackIntegrations, spans,sqlTemplates, subscriptionTiers, summaryTriggerSpans, tagClasses, traces, tracesAgentChats, tracesAgentMessages, tracesSummaries, users, userSubscriptionInfo, workspaceInvitations, workspaces, workspaceUsage } from "./schema";

export const slackIntegrationsRelations = relations(slackIntegrations, ({one}) => ({
  project: one(projects, {
    fields: [slackIntegrations.projectId],
    references: [projects.id]
  }),
}));

export const projectsRelations = relations(projects, ({one, many}) => ({
  slackIntegrations: many(slackIntegrations),
  datasets: many(datasets),
  workspace: one(workspaces, {
    fields: [projects.workspaceId],
    references: [workspaces.id]
  }),
  projectApiKeys: many(projectApiKeys),
  providerApiKeys: many(providerApiKeys),
  renderTemplates: many(renderTemplates),
  evaluators: many(evaluators),
  evaluatorSpanPaths: many(evaluatorSpanPaths),
  evaluations: many(evaluations),
  sharedPayloads: many(sharedPayloads),
  playgrounds: many(playgrounds),
  evaluatorScores: many(evaluatorScores),
  sqlTemplates: many(sqlTemplates),
  dashboardCharts: many(dashboardCharts),
  labelingQueues: many(labelingQueues),
  tracesAgentChats: many(tracesAgentChats),
  tracesAgentMessages: many(tracesAgentMessages),
  tracesSummaries: many(tracesSummaries),
  sharedTraces: many(sharedTraces),
  projectSettings: many(projectSettings),
  eventDefinitions: many(eventDefinitions),
  summaryTriggerSpans: many(summaryTriggerSpans),
  traces: many(traces),
  tagClasses: many(tagClasses),
  spans: many(spans),
}));

export const datasetsRelations = relations(datasets, ({one, many}) => ({
  project: one(projects, {
    fields: [datasets.projectId],
    references: [projects.id]
  }),
  datasetDatapoints: many(datasetDatapoints),
}));

export const datasetDatapointsRelations = relations(datasetDatapoints, ({one}) => ({
  dataset: one(datasets, {
    fields: [datasetDatapoints.datasetId],
    references: [datasets.id]
  }),
}));

export const workspacesRelations = relations(workspaces, ({one, many}) => ({
  projects: many(projects),
  membersOfWorkspaces: many(membersOfWorkspaces),
  workspaceInvitations: many(workspaceInvitations),
  workspaceUsages: many(workspaceUsage),
  subscriptionTier: one(subscriptionTiers, {
    fields: [workspaces.tierId],
    references: [subscriptionTiers.id]
  }),
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

export const apiKeysRelations = relations(apiKeys, ({one}) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id]
  }),
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

export const renderTemplatesRelations = relations(renderTemplates, ({one}) => ({
  project: one(projects, {
    fields: [renderTemplates.projectId],
    references: [projects.id]
  }),
}));

export const workspaceInvitationsRelations = relations(workspaceInvitations, ({one}) => ({
  workspace: one(workspaces, {
    fields: [workspaceInvitations.workspaceId],
    references: [workspaces.id]
  }),
}));

export const labelingQueueItemsRelations = relations(labelingQueueItems, ({one}) => ({
  labelingQueue: one(labelingQueues, {
    fields: [labelingQueueItems.queueId],
    references: [labelingQueues.id]
  }),
}));

export const labelingQueuesRelations = relations(labelingQueues, ({one, many}) => ({
  labelingQueueItems: many(labelingQueueItems),
  project: one(projects, {
    fields: [labelingQueues.projectId],
    references: [projects.id]
  }),
}));

export const evaluationsRelations = relations(evaluations, ({one, many}) => ({
  evaluationResults: many(evaluationResults),
  project: one(projects, {
    fields: [evaluations.projectId],
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

export const playgroundsRelations = relations(playgrounds, ({one}) => ({
  project: one(projects, {
    fields: [playgrounds.projectId],
    references: [projects.id]
  }),
}));

export const evaluatorScoresRelations = relations(evaluatorScores, ({one}) => ({
  project: one(projects, {
    fields: [evaluatorScores.projectId],
    references: [projects.id]
  }),
}));

export const workspaceUsageRelations = relations(workspaceUsage, ({one}) => ({
  workspace: one(workspaces, {
    fields: [workspaceUsage.workspaceId],
    references: [workspaces.id]
  }),
}));

export const subscriptionTiersRelations = relations(subscriptionTiers, ({many}) => ({
  workspaces: many(workspaces),
}));

export const sqlTemplatesRelations = relations(sqlTemplates, ({one}) => ({
  project: one(projects, {
    fields: [sqlTemplates.projectId],
    references: [projects.id]
  }),
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
}));

export const sharedTracesRelations = relations(sharedTraces, ({one}) => ({
  project: one(projects, {
    fields: [sharedTraces.projectId],
    references: [projects.id]
  }),
}));

export const projectSettingsRelations = relations(projectSettings, ({one}) => ({
  project: one(projects, {
    fields: [projectSettings.projectId],
    references: [projects.id]
  }),
}));

export const eventDefinitionsRelations = relations(eventDefinitions, ({one}) => ({
  project: one(projects, {
    fields: [eventDefinitions.projectId],
    references: [projects.id]
  }),
}));

export const summaryTriggerSpansRelations = relations(summaryTriggerSpans, ({one}) => ({
  project: one(projects, {
    fields: [summaryTriggerSpans.projectId],
    references: [projects.id]
  }),
}));

export const tracesRelations = relations(traces, ({one}) => ({
  project: one(projects, {
    fields: [traces.projectId],
    references: [projects.id]
  }),
}));

export const tagClassesRelations = relations(tagClasses, ({one}) => ({
  project: one(projects, {
    fields: [tagClasses.projectId],
    references: [projects.id]
  }),
}));

export const spansRelations = relations(spans, ({one}) => ({
  project: one(projects, {
    fields: [spans.projectId],
    references: [projects.id]
  }),
}));
