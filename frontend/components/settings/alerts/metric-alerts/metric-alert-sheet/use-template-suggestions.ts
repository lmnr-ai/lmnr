import useSWR from "swr";

import { type MetricRulePreview } from "@/lib/actions/alerts/metric-rule";
import { fetchApi } from "@/lib/api/fetch-api";

import { PREVIEW_HOURS } from "../constants";
import { probeRule, type Suggestion, suggestValues, usualPeak } from "./suggestions";
import { TEMPLATES } from "./templates";

const NONE: Record<string, Suggestion> = {};

const load = async (projectId: string): Promise<Record<string, Suggestion>> => {
  const entries = await Promise.all(
    TEMPLATES.filter((template) => template.suggest).map(async (template) => {
      const { data } = await fetchApi<MetricRulePreview>(`/api/projects/${projectId}/alerts/metric/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rule: probeRule(template), hours: PREVIEW_HOURS }),
      });
      // A template without a suggestion still works: its thresholds are typed in.
      const suggestion = data ? suggestValues(template, usualPeak(data.groups[0]?.points ?? [])) : null;
      return suggestion ? [[template.id, suggestion] as const] : [];
    })
  );
  return Object.fromEntries(entries.flat());
};

/** Thresholds for the templates that leave them open, by template id, from the last 7 days. */
export const useTemplateSuggestions = (projectId: string, enabled: boolean): Record<string, Suggestion> => {
  const { data } = useSWR(enabled ? ["metric-alert-template-suggestions", projectId] : null, () => load(projectId), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  return data ?? NONE;
};
