"use client";

import { useState } from "react";
import { type UseFormReturn } from "react-hook-form";

import { type LlmProfile } from "@/lib/actions/llm-profiles/schema";
import { type TestLlmProfileResult } from "@/lib/actions/llm-profiles/test";

import { buildRequestBody } from "./build-values";
import { type ModelTestStatus } from "./models-list/types";
import { type LlmProfileFormValues, missingRequiredSecrets } from "./types";

type Run = { key: string; statuses: Record<string, ModelTestStatus> };

/**
 * Tests every listed model against the form's current credentials, one request
 * per model in parallel. Results are keyed to the provider config + secrets they
 * were run with, so editing any of those drops them; adding or removing a model
 * only affects that row.
 */
export function useTestConnection(
  form: UseFormReturn<LlmProfileFormValues>,
  workspaceId: string,
  profile: LlmProfile | null
) {
  const values = form.watch();
  const [run, setRun] = useState<Run | null>(null);

  const { models, name: _name, ...body } = buildRequestBody(values);
  const key = JSON.stringify(body);
  const statuses = run?.key === key ? run.statuses : {};
  const isTesting = Object.values(statuses).some((s) => s.state === "testing");
  const canTest = models.length > 0 && !isTesting && missingRequiredSecrets(values, profile).length === 0;

  const test = async () => {
    setRun({ key, statuses: Object.fromEntries(models.map((m) => [m, { state: "testing" }])) });
    await Promise.all(
      models.map(async (model) => {
        const status = await testModel(workspaceId, profile?.id, body, model);
        setRun((prev) => (prev?.key === key ? { ...prev, statuses: { ...prev.statuses, [model]: status } } : prev));
      })
    );
  };

  return { statuses, isTesting, canTest, test };
}

async function testModel(
  workspaceId: string,
  profileId: string | undefined,
  body: Omit<ReturnType<typeof buildRequestBody>, "models" | "name">,
  model: string
): Promise<ModelTestStatus> {
  try {
    const res = await fetch(`/api/workspaces/${workspaceId}/llm-profiles/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, profileId, model }),
    });
    const data = (await res.json().catch(() => null)) as (TestLlmProfileResult & { error?: string }) | null;
    if (!res.ok || !data) {
      throw new Error(data?.error ?? "Failed to test connection");
    }
    return data.ok ? { state: "ok", latencyMs: data.latencyMs } : { state: "error", error: data.error };
  } catch (error) {
    return { state: "error", error: error instanceof Error ? error.message : "Failed to test connection" };
  }
}
