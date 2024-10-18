import { relations } from "drizzle-orm/relations";
import { projects, labelClasses, eventTemplates, labelClassesForPath, users, membersOfWorkspaces, workspaces, apiKeys, evaluations, datasets, pipelines, providerApiKeys, targetPipelineVersions, pipelineVersions, subscriptionTiers, userSubscriptionInfo, datasetDatapoints, evaluationResults, events, spans, labels, projectApiKeys, traces, workspaceUsage } from "./schema";

export const labelClassesRelations = relations(labelClasses, ({one, many}) => ({
  project: one(projects, {
    fields: [labelClasses.projectId],
    references: [projects.id]
  }),
  labels: many(labels),
}));

export const projectsRelations = relations(projects, ({one, many}) => ({
  labelClasses: many(labelClasses),
  eventTemplates: many(eventTemplates),
  labelClassesForPaths: many(labelClassesForPath),
  evaluations: many(evaluations),
  datasets: many(datasets),
  workspace: one(workspaces, {
    fields: [projects.workspaceId],
    references: [workspaces.id]
  }),
  pipelines: many(pipelines),
  providerApiKeys: many(providerApiKeys),
  projectApiKeys: many(projectApiKeys),
  traces: many(traces),
}));

export const eventTemplatesRelations = relations(eventTemplates, ({one, many}) => ({
  project: one(projects, {
    fields: [eventTemplates.projectId],
    references: [projects.id]
  }),
  events: many(events),
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
  apiKeys: many(apiKeys),
  userSubscriptionInfos: many(userSubscriptionInfo),
}));

export const workspacesRelations = relations(workspaces, ({one, many}) => ({
  membersOfWorkspaces: many(membersOfWorkspaces),
  projects: many(projects),
  subscriptionTier: one(subscriptionTiers, {
    fields: [workspaces.tierId],
    references: [subscriptionTiers.id]
  }),
  workspaceUsages: many(workspaceUsage),
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

export const datasetsRelations = relations(datasets, ({one, many}) => ({
  project: one(projects, {
    fields: [datasets.projectId],
    references: [projects.id]
  }),
  datasetDatapoints: many(datasetDatapoints),
}));

export const pipelinesRelations = relations(pipelines, ({one, many}) => ({
  project: one(projects, {
    fields: [pipelines.projectId],
    references: [projects.id]
  }),
  targetPipelineVersions: many(targetPipelineVersions),
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

export const subscriptionTiersRelations = relations(subscriptionTiers, ({many}) => ({
  workspaces: many(workspaces),
}));

export const userSubscriptionInfoRelations = relations(userSubscriptionInfo, ({one}) => ({
  user: one(users, {
    fields: [userSubscriptionInfo.userId],
    references: [users.id]
  }),
}));

export const datasetDatapointsRelations = relations(datasetDatapoints, ({one}) => ({
  dataset: one(datasets, {
    fields: [datasetDatapoints.datasetId],
    references: [datasets.id]
  }),
}));

export const evaluationResultsRelations = relations(evaluationResults, ({one}) => ({
  evaluation: one(evaluations, {
    fields: [evaluationResults.evaluationId],
    references: [evaluations.id]
  }),
}));

export const eventsRelations = relations(events, ({one}) => ({
  eventTemplate: one(eventTemplates, {
    fields: [events.templateId],
    references: [eventTemplates.id]
  }),
}));

export const labelsRelations = relations(labels, ({one}) => ({
  span: one(spans, {
    fields: [labels.spanId],
    references: [spans.spanId]
  }),
  labelClass: one(labelClasses, {
    fields: [labels.classId],
    references: [labelClasses.id]
  }),
}));

export const spansRelations = relations(spans, ({one, many}) => ({
  labels: many(labels),
  trace: one(traces, {
    fields: [spans.traceId],
    references: [traces.id]
  }),
}));

export const projectApiKeysRelations = relations(projectApiKeys, ({one}) => ({
  project: one(projects, {
    fields: [projectApiKeys.projectId],
    references: [projects.id]
  }),
}));

export const tracesRelations = relations(traces, ({one, many}) => ({
  spans: many(spans),
  project: one(projects, {
    fields: [traces.projectId],
    references: [projects.id]
  }),
}));

export const workspaceUsageRelations = relations(workspaceUsage, ({one}) => ({
  workspace: one(workspaces, {
    fields: [workspaceUsage.workspaceId],
    references: [workspaces.id]
  }),
}));
