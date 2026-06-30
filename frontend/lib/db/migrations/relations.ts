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
  agents,
  renderTemplates,
  tracesAgentChats,
  sharedEvals,
  users,
  apiKeys,
  labelingQueues,
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
  membersOfWorkspaces,
  projectApiKeys,
  alertTargets,
  sqlTemplates,
  sessions,
  deviceCodes,
  alertFilters,
  eventClusterConfigs,
  workspaceAddons,
  accounts,
  signalJobs,
  playgrounds,
  eventDefinitions,
  dashboardCharts,
  sharedPayloads,
  debuggerSessions,
  workspaceUsage,
  signalTriggers,
  chatMessages,
  chatSessions,
  tableViews,
  notificationReads,
  tagClasses,
  agentVersions,
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
  agents: many(agents),
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
  alertFilters: many(alertFilters),
  eventClusterConfigs: many(eventClusterConfigs),
  signalJobs: many(signalJobs),
  playgrounds: many(playgrounds),
  eventDefinitions: many(eventDefinitions),
  dashboardCharts: many(dashboardCharts),
  sharedPayloads: many(sharedPayloads),
  debuggerSessions: many(debuggerSessions),
  signalTriggers: many(signalTriggers),
  chatMessages: many(chatMessages),
  chatSessions: many(chatSessions),
  tableViews: many(tableViews),
  notificationReads: many(notificationReads),
  tagClasses: many(tagClasses),
  agentVersions: many(agentVersions),
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
  projects: many(projects),
  subscriptionTier: one(subscriptionTiers, {
    fields: [workspaces.tierId],
    references: [subscriptionTiers.id],
  }),
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

export const agentsRelations = relations(agents, ({ one, many }) => ({
  project: one(projects, {
    fields: [agents.projectId],
    references: [projects.id],
  }),
  agentVersions: many(agentVersions),
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
  projectApiKeys: many(projectApiKeys),
  sessions: many(sessions),
  deviceCodes: many(deviceCodes),
  accounts: many(accounts),
  notificationReads: many(notificationReads),
}));

export const labelingQueuesRelations = relations(labelingQueues, ({ one }) => ({
  project: one(projects, {
    fields: [labelingQueues.projectId],
    references: [projects.id],
  }),
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
  alertFilters: many(alertFilters),
}));

export const evaluationsRelations = relations(evaluations, ({ one }) => ({
  project: one(projects, {
    fields: [evaluations.projectId],
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

export const projectApiKeysRelations = relations(projectApiKeys, ({ one }) => ({
  user: one(users, {
    fields: [projectApiKeys.userId],
    references: [users.id],
  }),
  project: one(projects, {
    fields: [projectApiKeys.projectId],
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

export const sqlTemplatesRelations = relations(sqlTemplates, ({ one }) => ({
  project: one(projects, {
    fields: [sqlTemplates.projectId],
    references: [projects.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const deviceCodesRelations = relations(deviceCodes, ({ one }) => ({
  user: one(users, {
    fields: [deviceCodes.userId],
    references: [users.id],
  }),
}));

export const alertFiltersRelations = relations(alertFilters, ({ one }) => ({
  alert: one(alerts, {
    fields: [alertFilters.alertId],
    references: [alerts.id],
  }),
  project: one(projects, {
    fields: [alertFilters.projectId],
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

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
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

export const debuggerSessionsRelations = relations(debuggerSessions, ({ one }) => ({
  project: one(projects, {
    fields: [debuggerSessions.projectId],
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

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  project: one(projects, {
    fields: [chatMessages.projectId],
    references: [projects.id],
  }),
}));

export const chatSessionsRelations = relations(chatSessions, ({ one }) => ({
  project: one(projects, {
    fields: [chatSessions.projectId],
    references: [projects.id],
  }),
}));

export const tableViewsRelations = relations(tableViews, ({ one }) => ({
  project: one(projects, {
    fields: [tableViews.projectId],
    references: [projects.id],
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

export const tagClassesRelations = relations(tagClasses, ({ one }) => ({
  project: one(projects, {
    fields: [tagClasses.projectId],
    references: [projects.id],
  }),
}));

export const agentVersionsRelations = relations(agentVersions, ({ one }) => ({
  agent: one(agents, {
    fields: [agentVersions.agentId],
    references: [agents.id],
  }),
  project: one(projects, {
    fields: [agentVersions.projectId],
    references: [projects.id],
  }),
}));

export const tracesRelations = relations(traces, ({ one }) => ({
  project: one(projects, {
    fields: [traces.projectId],
    references: [projects.id],
  }),
}));
