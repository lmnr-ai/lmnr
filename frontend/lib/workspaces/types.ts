export type Project = {
  id: string;
  name: string;
  workspaceId: string;
};

export const WORKSPACE_ROLES = ["member", "admin", "owner"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const SSO_MANAGED_MEMBERSHIP_MESSAGE = "Workspace membership and roles are managed through Okta groups.";
export const SSO_MANAGED_WORKSPACE_CREATION_MESSAGE =
  "Workspaces are created from Okta groups. Ask your Okta admin for access.";
export const SSO_MANAGED_WORKSPACE_NAME_MESSAGE =
  "Workspace names are matched to Okta group names, so they can't be changed here.";
export const SSO_MANAGED_WORKSPACE_DELETION_MESSAGE =
  "Workspaces are managed through Okta groups, so they can't be deleted here.";

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

// Raw `subscription_tiers.name` values, not display names: render them via
// `tierDisplayName` ("Pro" shows as "Scale").
export enum WorkspaceTier {
  FREE = "Free",
  PRO = "Pro",
  // An earlier display name some DB rows carry for the internal "hobby" tier.
  HOBBY = "Starter",
  ENTERPRISE = "Enterprise",
}

/** The workspace's EFFECTIVE Privacy Mode, resolved server-side from the
 * tri-state stored setting (explicit on / explicit off / unset → per-plan
 * default) and DPA enforcement. `locked` means a signed DPA forces it on and
 * the toggle is read-only. Resolution lives in
 * `lib/actions/workspace/settings.ts` (server-only). */
export interface PrivacyModeState {
  enabled: boolean;
  locked: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  tierName: WorkspaceTier;
  addons: string[];
  // Present on surfaces that fetched it (settings page); absent elsewhere.
  privacyMode?: PrivacyModeState;
}

export interface WorkspaceWithProjects extends Workspace {
  projects: Project[];
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
  creditedSignalCostMicroUsd: number;
  uncreditedSignalCostMicroUsd: number;
  resetTime: Date;
  signalResetTime: Date;
}
