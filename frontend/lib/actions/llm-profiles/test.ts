import { z } from "zod/v4";

import { checkUserWorkspaceRole } from "@/lib/actions/workspace/utils";
import { type WorkspaceRole } from "@/lib/workspaces/types";

import { callAppServer } from "./app-server";
import { LLM_PROFILE_PROVIDERS } from "./schema";

const MEMBER_ROLES: WorkspaceRole[] = ["member", "admin", "owner"];

/** No `name`: the probe only needs credentials + model, so an unnamed draft can be tested. */
const TestLlmProfileSchema = z.object({
  workspaceId: z.guid(),
  /** When editing: omitted secrets fall back to this profile's stored values. */
  profileId: z.guid().optional(),
  profile: z.object({ provider: z.enum(LLM_PROFILE_PROVIDERS), config: z.record(z.string(), z.unknown()) }),
  secrets: z.record(z.string(), z.unknown()).optional(),
  model: z.string(),
});

export type TestLlmProfileInput = z.infer<typeof TestLlmProfileSchema>;

export type TestLlmProfileResult =
  | { ok: true; model: string; latencyMs: number }
  | { ok: false; model: string; error: string };

/** Runs a one-token generation on the app-server with the form's credentials; nothing is persisted. */
export async function testLlmProfile(input: TestLlmProfileInput): Promise<TestLlmProfileResult> {
  const { workspaceId, profileId, profile, secrets, model } = TestLlmProfileSchema.parse(input);
  await checkUserWorkspaceRole({ workspaceId, roles: MEMBER_ROLES });

  return callAppServer<TestLlmProfileResult>(`/workspaces/${workspaceId}/llm-profiles/test`, {
    method: "POST",
    body: { profileId, provider: profile.provider, config: profile.config, secrets, model },
  });
}
