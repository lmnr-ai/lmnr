// SWR keys that one component reads and another writes or invalidates. A key
// typed out twice can drift, and a mutate on the wrong string silently updates nothing.
export const swrKeys = {
  views: (projectId: string, resource: string) => `/api/projects/${projectId}/views?resource=${resource}`,
  traceTags: (projectId: string, traceId: string) => `/api/projects/${projectId}/traces/${traceId}/tags`,
  tagClasses: (projectId: string) => `/api/projects/${projectId}/tag-classes`,
  sqlTemplates: (projectId: string) => `/api/projects/${projectId}/sql/templates`,
  queues: (projectId: string) => `/api/projects/${projectId}/queues`,
  workspaceUsers: (workspaceId: string) => `/api/workspaces/${workspaceId}/users`,
  notifications: (workspaceId: string, projectId: string) =>
    `/api/workspaces/${workspaceId}/notifications?projectId=${projectId}`,
};
