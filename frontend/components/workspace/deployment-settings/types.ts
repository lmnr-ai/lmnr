import { type WorkspaceDeploymentSettings } from "@/lib/workspaces/types.ts";

export type DeploymentManagementForm = Pick<WorkspaceDeploymentSettings, "publicKey" | "dataPlaneUrl" | "mode">;
