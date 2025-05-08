import { relations } from "drizzle-orm/relations";
import { projects, datasets, datasetDatapoints, workspaces, labelClassesForPath, users, membersOfWorkspaces, subscriptionTiers, pipelines, projectApiKeys, providerApiKeys, targetPipelineVersions, pipelineVersions, userSubscriptionInfo, workspaceUsage, labelingQueues, labelingQueueItems, apiKeys, evaluations, evaluationResults, evaluationScores, playgrounds, spans, events, renderTemplates, labelClasses, labels, agentSessions, agentMessages, userCookies, userUsage, agentChats, workspaceInvitations, traces, userSubscriptionTiers, machines, datapointToSpan } from "./schema";

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
	pipelines: many(pipelines),
	projectApiKeys: many(projectApiKeys),
	providerApiKeys: many(providerApiKeys),
	labelingQueues: many(labelingQueues),
	evaluations: many(evaluations),
	playgrounds: many(playgrounds),
	renderTemplates: many(renderTemplates),
	labelClasses: many(labelClasses),
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
	workspaceInvitations: many(workspaceInvitations),
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

export const usersRelations = relations(users, ({one, many}) => ({
	membersOfWorkspaces: many(membersOfWorkspaces),
	userSubscriptionInfos: many(userSubscriptionInfo),
	apiKeys: many(apiKeys),
	userCookies: many(userCookies),
	userUsages: many(userUsage),
	agentChats: many(agentChats),
	userSubscriptionTier: one(userSubscriptionTiers, {
		fields: [users.tierId],
		references: [userSubscriptionTiers.id]
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

export const playgroundsRelations = relations(playgrounds, ({one}) => ({
	project: one(projects, {
		fields: [playgrounds.projectId],
		references: [projects.id]
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

export const agentMessagesRelations = relations(agentMessages, ({one}) => ({
	agentSession: one(agentSessions, {
		fields: [agentMessages.sessionId],
		references: [agentSessions.sessionId]
	}),
}));

export const agentSessionsRelations = relations(agentSessions, ({many}) => ({
	agentMessages: many(agentMessages),
	agentChats: many(agentChats),
}));

export const userCookiesRelations = relations(userCookies, ({one}) => ({
	user: one(users, {
		fields: [userCookies.userId],
		references: [users.id]
	}),
}));

export const userUsageRelations = relations(userUsage, ({one}) => ({
	user: one(users, {
		fields: [userUsage.userId],
		references: [users.id]
	}),
}));

export const agentChatsRelations = relations(agentChats, ({one}) => ({
	user: one(users, {
		fields: [agentChats.userId],
		references: [users.id]
	}),
	agentSession: one(agentSessions, {
		fields: [agentChats.sessionId],
		references: [agentSessions.sessionId]
	}),
}));

export const workspaceInvitationsRelations = relations(workspaceInvitations, ({one}) => ({
	workspace: one(workspaces, {
		fields: [workspaceInvitations.workspaceId],
		references: [workspaces.id]
	}),
}));

export const tracesRelations = relations(traces, ({one}) => ({
	project: one(projects, {
		fields: [traces.projectId],
		references: [projects.id]
	}),
}));

export const userSubscriptionTiersRelations = relations(userSubscriptionTiers, ({many}) => ({
	users: many(users),
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