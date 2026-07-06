import { observe } from "@lmnr-ai/lmnr";
import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";
import { isAiProviderConfigured } from "@/lib/ai/model";
import { cache, EVAL_LABEL_FIELD_CACHE_KEY } from "@/lib/cache";
import { resolveLabelPath } from "@/lib/evaluation/label-path";

import { generateLabelFieldPath, type LabelFieldSampleRow } from "./label-field-prompt";

export type { LabelFieldSampleRow } from "./label-field-prompt";

const LABEL_FIELD_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days, mirrors SPAN_RENDERING_KEY_CACHE_KEY's TTL
const SAMPLE_SIZE = 5;

export const GetLabelFieldSchema = z.object({
  projectId: z.guid(),
  evaluationId: z.guid(),
});

export interface LabelFieldResult {
  fieldPath: string | null;
}

// Samples are fetched here, NOT taken from the client: table rows carry
// `substring(data, 1, 200)` / `substring(target, 1, 200)`, so client rows can
// never validate a data/target path — only untruncated values give every
// source (data, metadata, target) an equal shot at being the label.
async function fetchSampleRows(projectId: string, evaluationId: string): Promise<LabelFieldSampleRow[]> {
  const rows = await executeQuery<{ index: number; data: string; metadata: string; target: string }>({
    query: `
      SELECT \`index\`, data, metadata, target
      FROM evaluation_datapoints
      WHERE evaluation_id = {evaluationId:UUID}
      ORDER BY \`index\` ASC
      LIMIT ${SAMPLE_SIZE}
    `,
    parameters: { evaluationId },
    projectId,
  });
  return rows;
}

// "Majority" = strictly more than half (avoids a 2-of-4 tie counting as a majority).
function resolvesOnMajority(fieldPath: string, sampleRows: LabelFieldSampleRow[]): boolean {
  if (sampleRows.length === 0) return false;
  const validCount = sampleRows.filter((row) => resolveLabelPath(row, fieldPath) !== null).length;
  return validCount * 2 > sampleRows.length;
}

/**
 * Mirrors the transcript-previews pattern: LLM picks the field ONCE per
 * evaluation (cached 7 days, including a validated-null so a bad fit doesn't
 * re-ask on every page load), then every row resolves the SAME path
 * deterministically. No app-server involvement.
 */
export async function resolveLabelField(input: z.infer<typeof GetLabelFieldSchema>): Promise<LabelFieldResult> {
  const { projectId, evaluationId } = GetLabelFieldSchema.parse(input);

  return observe({ name: "label-field:resolve", input: { projectId, evaluationId } }, async () => {
    const cacheKey = EVAL_LABEL_FIELD_CACHE_KEY(projectId, evaluationId);

    const cached = await cache.get<LabelFieldResult>(cacheKey).catch(() => null);
    if (cached) return cached;

    if (!isAiProviderConfigured()) {
      return { fieldPath: null };
    }

    const sampleRows = await fetchSampleRows(projectId, evaluationId).catch(() => []);
    // No rows yet: don't cache — a null shouldn't persist for 7 days once data arrives.
    if (sampleRows.length === 0) {
      return { fieldPath: null };
    }

    let fieldPath: string | null;
    try {
      const raw = await generateLabelFieldPath(sampleRows);
      fieldPath = raw && resolvesOnMajority(raw, sampleRows) ? raw : null;
    } catch (error) {
      // Transient provider failure — don't cache a null for 7 days over it.
      console.error("[label-field] LLM call failed:", error);
      return { fieldPath: null };
    }

    const result: LabelFieldResult = { fieldPath };
    await cache.set(cacheKey, result, { expireAfterSeconds: LABEL_FIELD_TTL_SECONDS }).catch(() => {});
    return result;
  });
}
