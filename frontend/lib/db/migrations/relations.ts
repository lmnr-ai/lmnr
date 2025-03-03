import { relations } from "drizzle-orm/relations";

import { apiKeys, datapointToSpan,datasetDatapoints, datasets, evaluationResults, evaluations, evaluationScores, events, labelClasses, labelClassesForPath, labelingQueueItems, labelingQueues, labels, machines, membersOfWorkspaces, pipelines, pipelineVersions, playgrounds, projectApiKeys, projects, providerApiKeys, renderTemplates, spans, subscriptionTiers, targetPipelineVersions, traces, users, userSubscriptionInfo, workspaces, workspaceUsage } from "./schema";

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
  labelClassesForPaths: many(labelClassesForPath),
  labelClasses: many(labelClasses),
  pipelines: many(pipelines),
  projectApiKeys: many(projectApiKeys),
  providerApiKeys: many(providerApiKeys),
  labelingQueues: many(labelingQueues),
  evaluations: many(evaluations),
  playgrounds: many(playgrounds),
  renderTemplates: many(renderTemplates),
  traces: many(traces),
  machines: many(machines),
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
  workspaceUsages: many(workspaceUsage),
}));

export const labelClassesForPathRelations = relations(labelClassesForPath, ({one}) => ({
  project: one(projects, {
    fields: [labelClassesForPath.projectId],
    references: [projects.id]
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

export const labelClassesRelations = relations(labelClasses, ({one, many}) => ({
  project: one(projects, {
    fields: [labelClasses.projectId],
    references: [projects.id]
  }),
  labels: many(labels),
}));

export const labelsRelations = relations(labels, ({one}) => ({
  labelClass: one(labelClasses, {
    fields: [labels.classId],
    references: [labelClasses.id]
  }),
}));

export const subscriptionTiersRelations = relations(subscriptionTiers, ({many}) => ({
  workspaces: many(workspaces),
}));

export const pipelinesRelations = relations(pipelines, ({one, many}) => ({
  project: one(projects, {
    fields: [pipelines.projectId],
    references: [projects.id]
  }),
  targetPipelineVersions: many(targetPipelineVersions),
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

export const pipelineVersionsRelations = relations(pipelineVersions, ({many}) => ({
  targetPipelineVersions: many(targetPipelineVersions),
}));

export const userSubscriptionInfoRelations = relations(userSubscriptionInfo, ({one}) => ({
  user: one(users, {
    fields: [userSubscriptionInfo.userId],
    references: [users.id]
  }),
}));

export const workspaceUsageRelations = relations(workspaceUsage, ({one}) => ({
  workspace: one(workspaces, {
    fields: [workspaceUsage.workspaceId],
    references: [workspaces.id]
  }),
}));

export const labelingQueuesRelations = relations(labelingQueues, ({one, many}) => ({
  project: one(projects, {
    fields: [labelingQueues.projectId],
    references: [projects.id]
  }),
  labelingQueueItems: many(labelingQueueItems),
}));

export const labelingQueueItemsRelations = relations(labelingQueueItems, ({one}) => ({
  labelingQueue: one(labelingQueues, {
    fields: [labelingQueueItems.queueId],
    references: [labelingQueues.id]
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

export const playgroundsRelations = relations(playgrounds, ({one}) => ({
  project: one(projects, {
    fields: [playgrounds.projectId],
    references: [projects.id]
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

export const eventsRelations = relations(events, ({one}) => ({
  span: one(spans, {
    fields: [events.spanId],
    references: [spans.spanId]
  }),
}));

export const spansRelations = relations(spans, ({one, many}) => ({
  events: many(events),
  datapointToSpans: many(datapointToSpan),
  project: one(projects, {
    fields: [spans.projectId],
    references: [projects.id]
  }),
}));

export const renderTemplatesRelations = relations(renderTemplates, ({one}) => ({
  project: one(projects, {
    fields: [renderTemplates.projectId],
    references: [projects.id]
  }),
}));

export const tracesRelations = relations(traces, ({one}) => ({
  project: one(projects, {
    fields: [traces.projectId],
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
