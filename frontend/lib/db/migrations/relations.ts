import { relations } from "drizzle-orm/relations";

import { agentChats, agentMessages, agentSessions, apiKeys, dashboardCharts, datapointToSpan, datasetDatapoints, datasetParquets, datasets, evaluationResults, evaluations, evaluationScores, evaluators, evaluatorScores, evaluatorSpanPaths, labelClasses, labelingQueueItems, labelingQueues, labels, machines, membersOfWorkspaces, pipelines, pipelineVersions, playgrounds, projectApiKeys, projects, providerApiKeys, renderTemplates, sharedPayloads, spans,sqlTemplates, subscriptionTiers, targetPipelineVersions, traces, tracesAgentChats, tracesAgentMessages, tracesSummaries, userCookies, users, userSubscriptionInfo, userSubscriptionTiers, userUsage, workspaceInvitations, workspaces, workspaceUsage } from "./schema";

export const datasetParquetsRelations = relations(datasetParquets, ({one}) => ({
  dataset: one(datasets, {
    fields: [datasetParquets.datasetId],
    references: [datasets.id]
  }),
}));

export const datasetsRelations = relations(datasets, ({one, many}) => ({
  datasetParquets: many(datasetParquets),
  project: one(projects, {
    fields: [datasets.projectId],
    references: [projects.id]
  }),
  datasetDatapoints: many(datasetDatapoints),
}));

export const agentChatsRelations = relations(agentChats, ({one}) => ({
  agentSession: one(agentSessions, {
    fields: [agentChats.sessionId],
    references: [agentSessions.sessionId]
  }),
  user: one(users, {
    fields: [agentChats.userId],
    references: [users.id]
  }),
}));

export const agentSessionsRelations = relations(agentSessions, ({many}) => ({
  agentChats: many(agentChats),
  agentMessages: many(agentMessages),
}));

export const usersRelations = relations(users, ({one, many}) => ({
  agentChats: many(agentChats),
  userUsages: many(userUsage),
  userCookies: many(userCookies),
  apiKeys: many(apiKeys),
  userSubscriptionTier: one(userSubscriptionTiers, {
    fields: [users.tierId],
    references: [userSubscriptionTiers.id]
  }),
  userSubscriptionInfos: many(userSubscriptionInfo),
  membersOfWorkspaces: many(membersOfWorkspaces),
}));

export const userUsageRelations = relations(userUsage, ({one}) => ({
  user: one(users, {
    fields: [userUsage.userId],
    references: [users.id]
  }),
}));

export const tracesAgentMessagesRelations = relations(tracesAgentMessages, ({one}) => ({
  project: one(projects, {
    fields: [tracesAgentMessages.projectId],
    references: [projects.id]
  }),
}));

export const projectsRelations = relations(projects, ({one, many}) => ({
  tracesAgentMessages: many(tracesAgentMessages),
  evaluators: many(evaluators),
  evaluatorSpanPaths: many(evaluatorSpanPaths),
  evaluatorScores: many(evaluatorScores),
  renderTemplates: many(renderTemplates),
  tracesAgentChats: many(tracesAgentChats),
  labelClasses: many(labelClasses),
  labelingQueues: many(labelingQueues),
  datasets: many(datasets),
  traces: many(traces),
  workspace: one(workspaces, {
    fields: [projects.workspaceId],
    references: [workspaces.id]
  }),
  providerApiKeys: many(providerApiKeys),
  pipelines: many(pipelines),
  tracesSummaries: many(tracesSummaries),
  evaluations: many(evaluations),
  projectApiKeys: many(projectApiKeys),
  sqlTemplates: many(sqlTemplates),
  playgrounds: many(playgrounds),
  dashboardCharts: many(dashboardCharts),
  sharedPayloads: many(sharedPayloads),
  machines: many(machines),
  spans: many(spans),
}));

export const evaluatorsRelations = relations(evaluators, ({one, many}) => ({
  project: one(projects, {
    fields: [evaluators.projectId],
    references: [projects.id]
  }),
  evaluatorSpanPaths: many(evaluatorSpanPaths),
}));

export const userCookiesRelations = relations(userCookies, ({one}) => ({
  user: one(users, {
    fields: [userCookies.userId],
    references: [users.id]
  }),
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

export const evaluatorScoresRelations = relations(evaluatorScores, ({one}) => ({
  project: one(projects, {
    fields: [evaluatorScores.projectId],
    references: [projects.id]
  }),
}));

export const workspaceInvitationsRelations = relations(workspaceInvitations, ({one}) => ({
  workspace: one(workspaces, {
    fields: [workspaceInvitations.workspaceId],
    references: [workspaces.id]
  }),
}));

export const workspacesRelations = relations(workspaces, ({one, many}) => ({
  workspaceInvitations: many(workspaceInvitations),
  subscriptionTier: one(subscriptionTiers, {
    fields: [workspaces.tierId],
    references: [subscriptionTiers.id]
  }),
  projects: many(projects),
  membersOfWorkspaces: many(membersOfWorkspaces),
  workspaceUsages: many(workspaceUsage),
}));

export const renderTemplatesRelations = relations(renderTemplates, ({one}) => ({
  project: one(projects, {
    fields: [renderTemplates.projectId],
    references: [projects.id]
  }),
}));

export const tracesAgentChatsRelations = relations(tracesAgentChats, ({one}) => ({
  project: one(projects, {
    fields: [tracesAgentChats.projectId],
    references: [projects.id]
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

export const agentMessagesRelations = relations(agentMessages, ({one}) => ({
  agentSession: one(agentSessions, {
    fields: [agentMessages.sessionId],
    references: [agentSessions.sessionId]
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({one}) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id]
  }),
}));

export const labelClassesRelations = relations(labelClasses, ({one, many}) => ({
  project: one(projects, {
    fields: [labelClasses.projectId],
    references: [projects.id]
  }),
  labels: many(labels),
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

export const tracesRelations = relations(traces, ({one, many}) => ({
  project: one(projects, {
    fields: [traces.projectId],
    references: [projects.id]
  }),
  tracesSummaries: many(tracesSummaries),
}));

export const subscriptionTiersRelations = relations(subscriptionTiers, ({many}) => ({
  workspaces: many(workspaces),
}));

export const userSubscriptionTiersRelations = relations(userSubscriptionTiers, ({many}) => ({
  users: many(users),
}));

export const targetPipelineVersionsRelations = relations(targetPipelineVersions, ({one}) => ({
  pipeline: one(pipelines, {
    fields: [targetPipelineVersions.pipelineId],
    references: [pipelines.id]
  }),
  pipelineVersion: one(pipelineVersions, {
    fields: [targetPipelineVersions.pipelineVersionId],
    references: [pipelineVersions.id]
  }),
}));

export const pipelinesRelations = relations(pipelines, ({one, many}) => ({
  targetPipelineVersions: many(targetPipelineVersions),
  project: one(projects, {
    fields: [pipelines.projectId],
    references: [projects.id]
  }),
}));

export const pipelineVersionsRelations = relations(pipelineVersions, ({many}) => ({
  targetPipelineVersions: many(targetPipelineVersions),
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

export const datasetDatapointsRelations = relations(datasetDatapoints, ({one, many}) => ({
  dataset: one(datasets, {
    fields: [datasetDatapoints.datasetId],
    references: [datasets.id]
  }),
  datapointToSpans: many(datapointToSpan),
}));

export const evaluationsRelations = relations(evaluations, ({one, many}) => ({
  project: one(projects, {
    fields: [evaluations.projectId],
    references: [projects.id]
  }),
  evaluationResults: many(evaluationResults),
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

export const projectApiKeysRelations = relations(projectApiKeys, ({one}) => ({
  project: one(projects, {
    fields: [projectApiKeys.projectId],
    references: [projects.id]
  }),
}));

export const workspaceUsageRelations = relations(workspaceUsage, ({one}) => ({
  workspace: one(workspaces, {
    fields: [workspaceUsage.workspaceId],
    references: [workspaces.id]
  }),
}));

export const labelsRelations = relations(labels, ({one}) => ({
  labelClass: one(labelClasses, {
    fields: [labels.classId],
    references: [labelClasses.id]
  }),
}));

export const sqlTemplatesRelations = relations(sqlTemplates, ({one}) => ({
  project: one(projects, {
    fields: [sqlTemplates.projectId],
    references: [projects.id]
  }),
}));

export const playgroundsRelations = relations(playgrounds, ({one}) => ({
  project: one(projects, {
    fields: [playgrounds.projectId],
    references: [projects.id]
  }),
}));

export const dashboardChartsRelations = relations(dashboardCharts, ({one}) => ({
  project: one(projects, {
    fields: [dashboardCharts.projectId],
    references: [projects.id]
  }),
}));

export const sharedPayloadsRelations = relations(sharedPayloads, ({one}) => ({
  project: one(projects, {
    fields: [sharedPayloads.projectId],
    references: [projects.id]
  }),
}));

export const machinesRelations = relations(machines, ({one}) => ({
  project: one(projects, {
    fields: [machines.projectId],
    references: [projects.id]
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
