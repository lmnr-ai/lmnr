import { relations } from "drizzle-orm/relations";

import { apiKeys, datapointToSpan, datasetDatapoints, datasets, evaluationResults, evaluations, evaluationScores, events, eventTemplates, labelClasses, labelClassesForPath, labelingQueueItems, labelingQueues, labels, membersOfWorkspaces, pipelines, pipelineVersions, playgrounds, projectApiKeys, projects, providerApiKeys, spans, subscriptionTiers, targetPipelineVersions, traces, users, userSubscriptionInfo, workspaces, workspaceUsage } from "./schema";

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

export const tracesRelations = relations(traces, ({one, many}) => ({
  project: one(projects, {
    fields: [traces.projectId],
    references: [projects.id]
  }),
  spans: many(spans),
}));

export const projectsRelations = relations(projects, ({one, many}) => ({
  traces: many(traces),
  labelingQueues: many(labelingQueues),
  providerApiKeys: many(providerApiKeys),
  evaluations: many(evaluations),
  eventTemplates: many(eventTemplates),
  playgrounds: many(playgrounds),
  labelClassesForPaths: many(labelClassesForPath),
  datasets: many(datasets),
  pipelines: many(pipelines),
  workspace: one(workspaces, {
    fields: [projects.workspaceId],
    references: [workspaces.id]
  }),
  projectApiKeys: many(projectApiKeys),
  labelClasses: many(labelClasses),
  spans: many(spans),
}));

export const evaluationResultsRelations = relations(evaluationResults, ({one, many}) => ({
  evaluation: one(evaluations, {
    fields: [evaluationResults.evaluationId],
    references: [evaluations.id]
  }),
  evaluationScores: many(evaluationScores),
}));

export const evaluationsRelations = relations(evaluations, ({one, many}) => ({
  evaluationResults: many(evaluationResults),
  project: one(projects, {
    fields: [evaluations.projectId],
    references: [projects.id]
  }),
}));

export const eventsRelations = relations(events, ({one}) => ({
  eventTemplate: one(eventTemplates, {
    fields: [events.templateId],
    references: [eventTemplates.id]
  }),
}));

export const eventTemplatesRelations = relations(eventTemplates, ({one, many}) => ({
  events: many(events),
  project: one(projects, {
    fields: [eventTemplates.projectId],
    references: [projects.id]
  }),
}));

export const labelingQueuesRelations = relations(labelingQueues, ({one, many}) => ({
  project: one(projects, {
    fields: [labelingQueues.projectId],
    references: [projects.id]
  }),
  labelingQueueItems: many(labelingQueueItems),
}));

export const providerApiKeysRelations = relations(providerApiKeys, ({one}) => ({
  project: one(projects, {
    fields: [providerApiKeys.projectId],
    references: [projects.id]
  }),
}));

export const workspaceUsageRelations = relations(workspaceUsage, ({one}) => ({
  workspace: one(workspaces, {
    fields: [workspaceUsage.workspaceId],
    references: [workspaces.id]
  }),
}));

export const workspacesRelations = relations(workspaces, ({one, many}) => ({
  workspaceUsages: many(workspaceUsage),
  membersOfWorkspaces: many(membersOfWorkspaces),
  projects: many(projects),
  subscriptionTier: one(subscriptionTiers, {
    fields: [workspaces.tierId],
    references: [subscriptionTiers.id]
  }),
}));

export const evaluationScoresRelations = relations(evaluationScores, ({one}) => ({
  evaluationResult: one(evaluationResults, {
    fields: [evaluationScores.resultId],
    references: [evaluationResults.id]
  }),
}));

export const playgroundsRelations = relations(playgrounds, ({one}) => ({
  project: one(projects, {
    fields: [playgrounds.projectId],
    references: [projects.id]
  }),
}));

export const labelClassesForPathRelations = relations(labelClassesForPath, ({one}) => ({
  project: one(projects, {
    fields: [labelClassesForPath.projectId],
    references: [projects.id]
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({one}) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id]
  }),
}));

export const usersRelations = relations(users, ({many}) => ({
  apiKeys: many(apiKeys),
  membersOfWorkspaces: many(membersOfWorkspaces),
  userSubscriptionInfos: many(userSubscriptionInfo),
}));

export const datasetDatapointsRelations = relations(datasetDatapoints, ({one, many}) => ({
  dataset: one(datasets, {
    fields: [datasetDatapoints.datasetId],
    references: [datasets.id]
  }),
  datapointToSpans: many(datapointToSpan),
}));

export const datasetsRelations = relations(datasets, ({one, many}) => ({
  datasetDatapoints: many(datasetDatapoints),
  project: one(projects, {
    fields: [datasets.projectId],
    references: [projects.id]
  }),
}));

export const labelingQueueItemsRelations = relations(labelingQueueItems, ({one}) => ({
  labelingQueue: one(labelingQueues, {
    fields: [labelingQueueItems.queueId],
    references: [labelingQueues.id]
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

export const projectApiKeysRelations = relations(projectApiKeys, ({one}) => ({
  project: one(projects, {
    fields: [projectApiKeys.projectId],
    references: [projects.id]
  }),
}));

export const subscriptionTiersRelations = relations(subscriptionTiers, ({many}) => ({
  workspaces: many(workspaces),
}));

export const userSubscriptionInfoRelations = relations(userSubscriptionInfo, ({one}) => ({
  user: one(users, {
    fields: [userSubscriptionInfo.userId],
    references: [users.id]
  }),
}));

export const labelsRelations = relations(labels, ({one}) => ({
  labelClass: one(labelClasses, {
    fields: [labels.classId],
    references: [labelClasses.id]
  }),
}));

export const labelClassesRelations = relations(labelClasses, ({one, many}) => ({
  labels: many(labels),
  project: one(projects, {
    fields: [labelClasses.projectId],
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
  trace: one(traces, {
    fields: [spans.traceId],
    references: [traces.id]
  }),
  project: one(projects, {
    fields: [spans.projectId],
    references: [projects.id]
  }),
}));
