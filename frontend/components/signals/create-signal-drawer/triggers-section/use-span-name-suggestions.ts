"use client";

import { useParams } from "next/navigation";
import useSWR from "swr";

import { type AutocompleteSuggestion } from "@/lib/actions/autocomplete";
import { swrFetcher } from "@/lib/utils";

/**
 * Span names seen in the project over the last 7 days, for the trigger's span
 * name field. Same endpoint the spans table's search bar uses, filtered to the
 * `name` field — the trigger matches a span's name, so the other autocomplete
 * fields (tags, model) are noise here.
 */
export const useSpanNameSuggestions = (): { spanNames: string[]; isLoading: boolean } => {
  const { projectId } = useParams();

  const { data, isLoading } = useSWR<{ suggestions: AutocompleteSuggestion[] }>(
    `/api/projects/${projectId}/spans/autocomplete?field=name`,
    swrFetcher,
    { revalidateOnFocus: false, revalidateOnReconnect: false }
  );

  return {
    spanNames: data?.suggestions.map((s) => s.value) ?? [],
    isLoading,
  };
};
