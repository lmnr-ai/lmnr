import { apiKeys, datapointToSpan, datasetDatapoints, datasets, evaluationResults, evaluations, evaluationScores, events, eventTemplates, labelClasses, labelClassesForPath, labelingQueueItems, labelingQueues, labels, membersOfWorkspaces, pipelines, pipelineVersions, playgrounds, projectApiKeys, projects, providerApiKeys, spans, subscriptionTiers, targetPipelineVersions, traces, users, userSubscriptionInfo, workspaces,workspaceUsage } from "./schema";
import { relations } from "drizzle-orm/relations";

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
  eventTemplates: many(eventTemplates),
  labelClasses: many(labelClasses),
  labelClassesForPaths: many(labelClassesForPath),
  pipelines: many(pipelines),
  projectApiKeys: many(projectApiKeys),
  providerApiKeys: many(providerApiKeys),
  labelingQueues: many(labelingQueues),
  traces: many(traces),
  evaluations: many(evaluations),
  playgrounds: many(playgrounds),
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

export const eventTemplatesRelations = relations(eventTemplates, ({one, many}) => ({
  project: one(projects, {
    fields: [eventTemplates.projectId],
    references: [projects.id]
  }),
  events: many(events),
}));

export const eventsRelations = relations(events, ({one}) => ({
  eventTemplate: one(eventTemplates, {
    fields: [events.templateId],
    references: [eventTemplates.id]
  }),
}));

export const labelClassesRelations = relations(labelClasses, ({one, many}) => ({
  project: one(projects, {
    fields: [labelClasses.projectId],
    references: [projects.id]
  }),
  labels: many(labels),
}));

export const labelClassesForPathRelations = relations(labelClassesForPath, ({one}) => ({
  project: one(projects, {
    fields: [labelClassesForPath.projectId],
    references: [projects.id]
  }),
}));

export const labelsRelations = relations(labels, ({one}) => ({
  labelClass: one(labelClasses, {
    fields: [labels.classId],
    references: [labelClasses.id]
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
  apiKeys: many(apiKeys),
  userSubscriptionInfos: many(userSubscriptionInfo),
}));

export const apiKeysRelations = relations(apiKeys, ({one}) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id]
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

export const tracesRelations = relations(traces, ({one, many}) => ({
  project: one(projects, {
    fields: [traces.projectId],
    references: [projects.id]
  }),
  spans: many(spans),
}));

export const evaluationsRelations = relations(evaluations, ({one, many}) => ({
  evaluationResults: many(evaluationResults),
  project: one(projects, {
    fields: [evaluations.projectId],
    references: [projects.id]
  }),
}));

export const playgroundsRelations = relations(playgrounds, ({one}) => ({
  project: one(projects, {
    fields: [playgrounds.projectId],
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
