import { relations } from "drizzle-orm/relations";
import {
  datasets,
  datasetParquets,
  projects,
  workspaces,
  workspaceUsageLimits,
  workspaceUsageWarnings,
  signals,
  tracesAgentMessages,
  slackIntegrations,
  evaluators,
  evaluatorSpanPaths,
  evaluatorScores,
  workspaceInvitations,
  renderTemplates,
  tracesAgentChats,
  labelingQueues,
  labelingQueueItems,
  sharedEvals,
  users,
  apiKeys,
  subscriptionTiers,
  providerApiKeys,
  userSubscriptionInfo,
  sharedTraces,
  datasetExportJobs,
  customModelCosts,
  reports,
  reportTargets,
  alerts,
  evaluations,
  projectApiKeys,
  membersOfWorkspaces,
  alertTargets,
  sqlTemplates,
  eventClusterConfigs,
  workspaceAddons,
  signalJobs,
  playgrounds,
  eventDefinitions,
  dashboardCharts,
  sharedPayloads,
  rolloutSessions,
  workspaceUsage,
  signalTriggers,
  spanRenderingKeys,
  tagClasses,
  traces,
} from "./schema";

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

export const datasetsRelations = relations(datasets, ({ one, many }) => ({
  datasetParquets: many(datasetParquets),
  project: one(projects, {
    fields: [datasets.projectId],
    references: [projects.id],
  }),
  datasetExportJobs: many(datasetExportJobs),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  datasetParquets: many(datasetParquets),
  signals: many(signals),
  tracesAgentMessages: many(tracesAgentMessages),
  evaluators: many(evaluators),
  evaluatorSpanPaths: many(evaluatorSpanPaths),
  evaluatorScores: many(evaluatorScores),
  renderTemplates: many(renderTemplates),
  tracesAgentChats: many(tracesAgentChats),
  sharedEvals: many(sharedEvals),
  labelingQueues: many(labelingQueues),
  datasets: many(datasets),
  workspace: one(workspaces, {
    fields: [projects.workspaceId],
    references: [workspaces.id],
  }),
  providerApiKeys: many(providerApiKeys),
  sharedTraces: many(sharedTraces),
  datasetExportJobs: many(datasetExportJobs),
  customModelCosts: many(customModelCosts),
  alerts: many(alerts),
  evaluations: many(evaluations),
  projectApiKeys: many(projectApiKeys),
  alertTargets: many(alertTargets),
  sqlTemplates: many(sqlTemplates),
  eventClusterConfigs: many(eventClusterConfigs),
  signalJobs: many(signalJobs),
  playgrounds: many(playgrounds),
  eventDefinitions: many(eventDefinitions),
  dashboardCharts: many(dashboardCharts),
  sharedPayloads: many(sharedPayloads),
  rolloutSessions: many(rolloutSessions),
  signalTriggers: many(signalTriggers),
  spanRenderingKeys: many(spanRenderingKeys),
  tagClasses: many(tagClasses),
  traces: many(traces),
}));

export const workspaceUsageLimitsRelations = relations(workspaceUsageLimits, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceUsageLimits.workspaceId],
    references: [workspaces.id],
  }),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  workspaceUsageLimits: many(workspaceUsageLimits),
  workspaceUsageWarnings: many(workspaceUsageWarnings),
  slackIntegrations: many(slackIntegrations),
  workspaceInvitations: many(workspaceInvitations),
  subscriptionTier: one(subscriptionTiers, {
    fields: [workspaces.tierId],
    references: [subscriptionTiers.id],
  }),
  projects: many(projects),
  reports: many(reports),
  reportTargets: many(reportTargets),
  membersOfWorkspaces: many(membersOfWorkspaces),
  workspaceAddons: many(workspaceAddons),
  workspaceUsages: many(workspaceUsage),
}));

export const workspaceUsageWarningsRelations = relations(workspaceUsageWarnings, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceUsageWarnings.workspaceId],
    references: [workspaces.id],
  }),
}));

export const signalsRelations = relations(signals, ({ one, many }) => ({
  project: one(projects, {
    fields: [signals.projectId],
    references: [projects.id],
  }),
  signalJobs: many(signalJobs),
  signalTriggers: many(signalTriggers),
}));

export const tracesAgentMessagesRelations = relations(tracesAgentMessages, ({ one }) => ({
  project: one(projects, {
    fields: [tracesAgentMessages.projectId],
    references: [projects.id],
  }),
}));

export const slackIntegrationsRelations = relations(slackIntegrations, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [slackIntegrations.workspaceId],
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

export const evaluatorScoresRelations = relations(evaluatorScores, ({ one }) => ({
  project: one(projects, {
    fields: [evaluatorScores.projectId],
    references: [projects.id],
  }),
}));

export const workspaceInvitationsRelations = relations(workspaceInvitations, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceInvitations.workspaceId],
    references: [workspaces.id],
  }),
}));

export const renderTemplatesRelations = relations(renderTemplates, ({ one }) => ({
  project: one(projects, {
    fields: [renderTemplates.projectId],
    references: [projects.id],
  }),
}));

export const tracesAgentChatsRelations = relations(tracesAgentChats, ({ one }) => ({
  project: one(projects, {
    fields: [tracesAgentChats.projectId],
    references: [projects.id],
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

export const sharedEvalsRelations = relations(sharedEvals, ({ one }) => ({
  project: one(projects, {
    fields: [sharedEvals.projectId],
    references: [projects.id],
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  apiKeys: many(apiKeys),
  userSubscriptionInfos: many(userSubscriptionInfo),
  membersOfWorkspaces: many(membersOfWorkspaces),
}));

export const subscriptionTiersRelations = relations(subscriptionTiers, ({ many }) => ({
  workspaces: many(workspaces),
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

export const sharedTracesRelations = relations(sharedTraces, ({ one }) => ({
  project: one(projects, {
    fields: [sharedTraces.projectId],
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

export const customModelCostsRelations = relations(customModelCosts, ({ one }) => ({
  project: one(projects, {
    fields: [customModelCosts.projectId],
    references: [projects.id],
  }),
}));

export const reportsRelations = relations(reports, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [reports.workspaceId],
    references: [workspaces.id],
  }),
  reportTargets: many(reportTargets),
}));

export const reportTargetsRelations = relations(reportTargets, ({ one }) => ({
  report: one(reports, {
    fields: [reportTargets.reportId],
    references: [reports.id],
  }),
  workspace: one(workspaces, {
    fields: [reportTargets.workspaceId],
    references: [workspaces.id],
  }),
}));

export const alertsRelations = relations(alerts, ({ one, many }) => ({
  project: one(projects, {
    fields: [alerts.projectId],
    references: [projects.id],
  }),
  alertTargets: many(alertTargets),
}));

export const evaluationsRelations = relations(evaluations, ({ one }) => ({
  project: one(projects, {
    fields: [evaluations.projectId],
    references: [projects.id],
  }),
}));

export const projectApiKeysRelations = relations(projectApiKeys, ({ one }) => ({
  project: one(projects, {
    fields: [projectApiKeys.projectId],
    references: [projects.id],
  }),
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

export const sqlTemplatesRelations = relations(sqlTemplates, ({ one }) => ({
  project: one(projects, {
    fields: [sqlTemplates.projectId],
    references: [projects.id],
  }),
}));

export const eventClusterConfigsRelations = relations(eventClusterConfigs, ({ one }) => ({
  project: one(projects, {
    fields: [eventClusterConfigs.projectId],
    references: [projects.id],
  }),
}));

export const workspaceAddonsRelations = relations(workspaceAddons, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceAddons.workspaceId],
    references: [workspaces.id],
  }),
}));

export const signalJobsRelations = relations(signalJobs, ({ one }) => ({
  project: one(projects, {
    fields: [signalJobs.projectId],
    references: [projects.id],
  }),
  signal: one(signals, {
    fields: [signalJobs.signalId],
    references: [signals.id],
  }),
}));

export const playgroundsRelations = relations(playgrounds, ({ one }) => ({
  project: one(projects, {
    fields: [playgrounds.projectId],
    references: [projects.id],
  }),
}));

export const eventDefinitionsRelations = relations(eventDefinitions, ({ one }) => ({
  project: one(projects, {
    fields: [eventDefinitions.projectId],
    references: [projects.id],
  }),
}));

export const dashboardChartsRelations = relations(dashboardCharts, ({ one }) => ({
  project: one(projects, {
    fields: [dashboardCharts.projectId],
    references: [projects.id],
  }),
}));

export const sharedPayloadsRelations = relations(sharedPayloads, ({ one }) => ({
  project: one(projects, {
    fields: [sharedPayloads.projectId],
    references: [projects.id],
  }),
}));

export const rolloutSessionsRelations = relations(rolloutSessions, ({ one }) => ({
  project: one(projects, {
    fields: [rolloutSessions.projectId],
    references: [projects.id],
  }),
}));

export const workspaceUsageRelations = relations(workspaceUsage, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceUsage.workspaceId],
    references: [workspaces.id],
  }),
}));

export const signalTriggersRelations = relations(signalTriggers, ({ one }) => ({
  project: one(projects, {
    fields: [signalTriggers.projectId],
    references: [projects.id],
  }),
  signal: one(signals, {
    fields: [signalTriggers.signalId],
    references: [signals.id],
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
