// Default workspace/project names for the zero-friction CLI device-approval flow:
// approving is the last step, so nothing is ever typed by the user.

import { orgNameFromEmail } from "@/lib/email-domain";

export const DEFAULT_PROJECT_NAME = "dev";
export const DEFAULT_WORKSPACE_NAME = "my-workspace";

// "ada@acme.com" -> "Acme", "ada@gmail.com" -> "my-workspace".
export const workspaceNameFromEmail = (email?: string | null): string =>
  orgNameFromEmail(email) ?? DEFAULT_WORKSPACE_NAME;
