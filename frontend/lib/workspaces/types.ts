export type Project = {
  id: string;
  name: string;
  workspaceId: string;
};

export type WorkspaceRole = "member" | "admin" | "owner";

export interface WorkspaceUser {
  id: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  createdAt: string;
}

export enum DeploymentType {
  CLOUD = "CLOUD",
  HYBRID = "HYBRID",
}

export interface WorkspaceDeploymentSettings {
  workspaceId: string;
  mode: DeploymentType;
  privateKey?: string;
  publicKey?: string;
  dataPlaneUrl?: string;
}

export enum WorkspaceTier {
  FREE = "Free",
  PRO = "Pro",
  // Display name for the internal "hobby" tier (renamed from "Hobby").
  HOBBY = "Starter",
  ENTERPRISE = "Enterprise",
}

/** Typed view of `workspaces.settings` JSONB. Kept as a plain interface here
 * (client-safe); the Zod schema + write path live in
 * `lib/actions/workspace/settings.ts` (server-only). */
export interface WorkspaceSettings {
  privacyMode: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  tierName: WorkspaceTier;
  addons: string[];
  // Present on surfaces that fetched it (settings page); absent elsewhere.
  settings?: WorkspaceSettings;
}

export interface WorkspaceWithProjects extends Workspace {
  projects: Project[];
}

export interface WorkspaceWithUsers extends Workspace {
  users: WorkspaceUser[];
}

export interface WorkspaceWithOptionalUsers extends Workspace {
  users?: WorkspaceUser[];
}

export interface WorkspaceInvitation {
  id: string;
  workspaceId: string;
  email: string | null;
  createdAt: string;
}

export interface WorkspaceUsage {
  totalBytesIngested: number;
  totalSignalCostMicroUsd: number;
  resetTime: Date;
}
