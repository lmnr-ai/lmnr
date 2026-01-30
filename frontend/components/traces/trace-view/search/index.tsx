import { useMemo } from "react";

import AdvancedSearch from "@/components/common/advanced-search";
import { extractSpanSuggestions, STATIC_SPAN_SUGGESTIONS } from "@/components/traces/trace-view/search/utils";
import { type TraceViewSpan } from "@/components/traces/trace-view/trace-view-store";
import { filterColumns } from "@/components/traces/trace-view/utils";
import { type Filter } from "@/lib/actions/common/filters";
import { cn } from "@/lib/utils";

interface TraceViewSearchProps {
  spans: TraceViewSpan[];
  onSubmit: (filters: Filter[], search: string) => void;
  className?: string;
}

const TraceViewSearch = ({ spans, onSubmit, className }: TraceViewSearchProps) => {
  const suggestions = useMemo(() => {
    const dynamicSuggestions = extractSpanSuggestions(spans);
    const allSuggestions = [...dynamicSuggestions, ...STATIC_SPAN_SUGGESTIONS];

    const map = new Map<string, string[]>();
    for (const suggestion of allSuggestions) {
      const existing = map.get(suggestion.field) || [];
      if (!existing.includes(suggestion.value)) {
        existing.push(suggestion.value);
      }
      map.set(suggestion.field, existing);
    }
    return map;
  }, [spans]);

  return (
    <AdvancedSearch
      mode="state"
      filters={filterColumns}
      resource="spans"
      value={{ filters: [], search: "" }}
      onSubmit={onSubmit}
      placeholder="Search in spans..."
      className={cn("w-full", className)}
      options={{
        suggestions,
        disableHotKey: true,
      }}
    />
  );
};

export default TraceViewSearch;
