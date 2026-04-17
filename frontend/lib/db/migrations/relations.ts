import { relations } from "drizzle-orm/relations";
import {
  projects,
  rolloutSessions,
  sharedEvals,
  workspaces,
  workspaceAddons,
  datasets,
  users,
  membersOfWorkspaces,
  providerApiKeys,
  userSubscriptionInfo,
  customModelCosts,
  alerts,
  alertTargets,
  reportTargets,
  reports,
  workspaceUsageLimits,
  workspaceUsage,
  apiKeys,
  renderTemplates,
  workspaceUsageWarnings,
  labelingQueues,
  labelingQueueItems,
  workspaceInvitations,
  evaluators,
  evaluatorSpanPaths,
  subscriptionTiers,
  evaluations,
  sharedPayloads,
  playgrounds,
  evaluatorScores,
  sqlTemplates,
  dashboardCharts,
  tracesAgentChats,
  tracesAgentMessages,
  sharedTraces,
  eventDefinitions,
  datasetExportJobs,
  datasetParquets,
  projectApiKeys,
  slackIntegrations,
  notificationReads,
  spanRenderingKeys,
  tagClasses,
  traces,
} from "./schema";

export const rolloutSessionsRelations = relations(rolloutSessions, ({ one }) => ({
  project: one(projects, {
    fields: [rolloutSessions.projectId],
    references: [projects.id],
  }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  rolloutSessions: many(rolloutSessions),
  sharedEvals: many(sharedEvals),
  datasets: many(datasets),
  workspace: one(workspaces, {
    fields: [projects.workspaceId],
    references: [workspaces.id],
  }),
  providerApiKeys: many(providerApiKeys),
  customModelCosts: many(customModelCosts),
  alertTargets: many(alertTargets),
  alerts: many(alerts),
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
  sharedTraces: many(sharedTraces),
  eventDefinitions: many(eventDefinitions),
  datasetExportJobs: many(datasetExportJobs),
  datasetParquets: many(datasetParquets),
  projectApiKeys: many(projectApiKeys),
  notificationReads: many(notificationReads),
  spanRenderingKeys: many(spanRenderingKeys),
  tagClasses: many(tagClasses),
  traces: many(traces),
}));

export const sharedEvalsRelations = relations(sharedEvals, ({ one }) => ({
  project: one(projects, {
    fields: [sharedEvals.projectId],
    references: [projects.id],
  }),
}));

export const workspaceAddonsRelations = relations(workspaceAddons, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceAddons.workspaceId],
    references: [workspaces.id],
  }),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  workspaceAddons: many(workspaceAddons),
  projects: many(projects),
  membersOfWorkspaces: many(membersOfWorkspaces),
  reportTargets: many(reportTargets),
  reports: many(reports),
  workspaceUsageLimits: many(workspaceUsageLimits),
  workspaceUsages: many(workspaceUsage),
  workspaceUsageWarnings: many(workspaceUsageWarnings),
  workspaceInvitations: many(workspaceInvitations),
  subscriptionTier: one(subscriptionTiers, {
    fields: [workspaces.tierId],
    references: [subscriptionTiers.id],
  }),
  slackIntegrations: many(slackIntegrations),
}));

export const datasetsRelations = relations(datasets, ({ one, many }) => ({
  project: one(projects, {
    fields: [datasets.projectId],
    references: [projects.id],
  }),
  datasetExportJobs: many(datasetExportJobs),
  datasetParquets: many(datasetParquets),
}));

export const membersOfWorkspacesRelations = relations(membersOfWorkspaces, ({ one }) => ({
  user: one(users, {
    fields: [membersOfWorkspaces.userId],
    references: [users.id],
  }),
  workspace: one(workspaces, {
    fields: [membersOfWorkspaces.workspaceId],
    references: [workspaces.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  membersOfWorkspaces: many(membersOfWorkspaces),
  userSubscriptionInfos: many(userSubscriptionInfo),
  apiKeys: many(apiKeys),
  notificationReads: many(notificationReads),
}));

export const providerApiKeysRelations = relations(providerApiKeys, ({ one }) => ({
  project: one(projects, {
    fields: [providerApiKeys.projectId],
    references: [projects.id],
  }),
}));

export const userSubscriptionInfoRelations = relations(userSubscriptionInfo, ({ one }) => ({
  user: one(users, {
    fields: [userSubscriptionInfo.userId],
    references: [users.id],
  }),
}));

export const customModelCostsRelations = relations(customModelCosts, ({ one }) => ({
  project: one(projects, {
    fields: [customModelCosts.projectId],
    references: [projects.id],
  }),
}));

export const alertTargetsRelations = relations(alertTargets, ({ one }) => ({
  alert: one(alerts, {
    fields: [alertTargets.alertId],
    references: [alerts.id],
  }),
  project: one(projects, {
    fields: [alertTargets.projectId],
    references: [projects.id],
  }),
}));

export const alertsRelations = relations(alerts, ({ one, many }) => ({
  alertTargets: many(alertTargets),
  project: one(projects, {
    fields: [alerts.projectId],
    references: [projects.id],
  }),
}));

export const reportTargetsRelations = relations(reportTargets, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [reportTargets.workspaceId],
    references: [workspaces.id],
  }),
  report: one(reports, {
    fields: [reportTargets.reportId],
    references: [reports.id],
  }),
}));

export const reportsRelations = relations(reports, ({ one, many }) => ({
  reportTargets: many(reportTargets),
  workspace: one(workspaces, {
    fields: [reports.workspaceId],
    references: [workspaces.id],
  }),
}));

export const workspaceUsageLimitsRelations = relations(workspaceUsageLimits, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceUsageLimits.workspaceId],
    references: [workspaces.id],
  }),
}));

export const workspaceUsageRelations = relations(workspaceUsage, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceUsage.workspaceId],
    references: [workspaces.id],
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
  }),
}));

export const renderTemplatesRelations = relations(renderTemplates, ({ one }) => ({
  project: one(projects, {
    fields: [renderTemplates.projectId],
    references: [projects.id],
  }),
}));

export const workspaceUsageWarningsRelations = relations(workspaceUsageWarnings, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceUsageWarnings.workspaceId],
    references: [workspaces.id],
  }),
}));

export const labelingQueueItemsRelations = relations(labelingQueueItems, ({ one }) => ({
  labelingQueue: one(labelingQueues, {
    fields: [labelingQueueItems.queueId],
    references: [labelingQueues.id],
  }),
}));

export const labelingQueuesRelations = relations(labelingQueues, ({ one, many }) => ({
  labelingQueueItems: many(labelingQueueItems),
  project: one(projects, {
    fields: [labelingQueues.projectId],
    references: [projects.id],
  }),
}));

export const workspaceInvitationsRelations = relations(workspaceInvitations, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceInvitations.workspaceId],
    references: [workspaces.id],
  }),
}));

export const evaluatorsRelations = relations(evaluators, ({ one, many }) => ({
  project: one(projects, {
    fields: [evaluators.projectId],
    references: [projects.id],
  }),
  evaluatorSpanPaths: many(evaluatorSpanPaths),
}));

export const evaluatorSpanPathsRelations = relations(evaluatorSpanPaths, ({ one }) => ({
  evaluator: one(evaluators, {
    fields: [evaluatorSpanPaths.evaluatorId],
    references: [evaluators.id],
  }),
  project: one(projects, {
    fields: [evaluatorSpanPaths.projectId],
    references: [projects.id],
  }),
}));

export const subscriptionTiersRelations = relations(subscriptionTiers, ({ many }) => ({
  workspaces: many(workspaces),
}));

export const evaluationsRelations = relations(evaluations, ({ one }) => ({
  project: one(projects, {
    fields: [evaluations.projectId],
    references: [projects.id],
  }),
}));

export const sharedPayloadsRelations = relations(sharedPayloads, ({ one }) => ({
  project: one(projects, {
    fields: [sharedPayloads.projectId],
    references: [projects.id],
  }),
}));

export const playgroundsRelations = relations(playgrounds, ({ one }) => ({
  project: one(projects, {
    fields: [playgrounds.projectId],
    references: [projects.id],
  }),
}));

export const evaluatorScoresRelations = relations(evaluatorScores, ({ one }) => ({
  project: one(projects, {
    fields: [evaluatorScores.projectId],
    references: [projects.id],
  }),
}));

export const sqlTemplatesRelations = relations(sqlTemplates, ({ one }) => ({
  project: one(projects, {
    fields: [sqlTemplates.projectId],
    references: [projects.id],
  }),
}));

export const dashboardChartsRelations = relations(dashboardCharts, ({ one }) => ({
  project: one(projects, {
    fields: [dashboardCharts.projectId],
    references: [projects.id],
  }),
}));

export const tracesAgentChatsRelations = relations(tracesAgentChats, ({ one }) => ({
  project: one(projects, {
    fields: [tracesAgentChats.projectId],
    references: [projects.id],
  }),
}));

export const tracesAgentMessagesRelations = relations(tracesAgentMessages, ({ one }) => ({
  project: one(projects, {
    fields: [tracesAgentMessages.projectId],
    references: [projects.id],
  }),
}));

export const sharedTracesRelations = relations(sharedTraces, ({ one }) => ({
  project: one(projects, {
    fields: [sharedTraces.projectId],
    references: [projects.id],
  }),
}));

export const eventDefinitionsRelations = relations(eventDefinitions, ({ one }) => ({
  project: one(projects, {
    fields: [eventDefinitions.projectId],
    references: [projects.id],
  }),
}));

export const datasetExportJobsRelations = relations(datasetExportJobs, ({ one }) => ({
  dataset: one(datasets, {
    fields: [datasetExportJobs.datasetId],
    references: [datasets.id],
  }),
  project: one(projects, {
    fields: [datasetExportJobs.projectId],
    references: [projects.id],
  }),
}));

export const datasetParquetsRelations = relations(datasetParquets, ({ one }) => ({
  dataset: one(datasets, {
    fields: [datasetParquets.datasetId],
    references: [datasets.id],
  }),
  project: one(projects, {
    fields: [datasetParquets.projectId],
    references: [projects.id],
  }),
}));

export const projectApiKeysRelations = relations(projectApiKeys, ({ one }) => ({
  project: one(projects, {
    fields: [projectApiKeys.projectId],
    references: [projects.id],
  }),
}));

export const slackIntegrationsRelations = relations(slackIntegrations, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [slackIntegrations.workspaceId],
    references: [workspaces.id],
  }),
}));

export const notificationReadsRelations = relations(notificationReads, ({ one }) => ({
  project: one(projects, {
    fields: [notificationReads.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [notificationReads.userId],
    references: [users.id],
  }),
}));

export const spanRenderingKeysRelations = relations(spanRenderingKeys, ({ one }) => ({
  project: one(projects, {
    fields: [spanRenderingKeys.projectId],
    references: [projects.id],
  }),
}));

export const tagClassesRelations = relations(tagClasses, ({ one }) => ({
  project: one(projects, {
    fields: [tagClasses.projectId],
    references: [projects.id],
  }),
}));

export const tracesRelations = relations(traces, ({ one }) => ({
  project: one(projects, {
    fields: [traces.projectId],
    references: [projects.id],
  }),
}));
