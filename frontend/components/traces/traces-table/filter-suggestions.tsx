"use client";

import { isEmpty } from "lodash";
import { Search } from "lucide-react";
import { memo } from "react";

import { Badge } from "@/components/ui/badge";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type SuggestionType = "field" | "value" | "raw_search";

export interface Suggestion {
  type: SuggestionType;
  field?: string;
  value: string;
  displayName?: string;
}

interface FilterSuggestionsProps {
  suggestions: Suggestion[];
  onSelect: (suggestion: Suggestion) => void;
  isLoading?: boolean;
  inputValue: string;
  className?: string;
}

const SuggestionItem = ({ suggestion }: { suggestion: Suggestion }) => {
  if (suggestion.type === "raw_search") {
    return (
      <div className="flex items-center gap-2 text-secondary-foreground">
        <Search className="w-3 h-3" />
        <span>Full text search:</span>
        <span className="font-medium">&quot;{suggestion.value}&quot;</span>
      </div>
    );
  }

  if (suggestion.type === "field") {
    return (
      <div className="flex items-center gap-2 text-secondary-foreground">
        <Badge variant="outline" className="font-semibold text-[10px] py-0.5 px-1">
          {suggestion.displayName || suggestion.value}
        </Badge>
        <span className="text-xs text-muted-foreground">filter field</span>
      </div>
    );
  }

  // type === "value"
  return (
    <div className="flex items-center gap-2 text-secondary-foreground">
      {suggestion.field && (
        <Badge variant="outline" className="font-semibold text-[10px] py-0.5 px-1">
          {suggestion.field}
        </Badge>
      )}
      <span className="font-medium">{suggestion.value}</span>
    </div>
  );
};

const FilterSuggestions = ({
  suggestions,
  onSelect,
  isLoading = false,
  inputValue,
  className,
}: FilterSuggestionsProps) => (
  <div className={cn("bg-secondary border rounded-md shadow-md overflow-hidden", className)}>
    {!isEmpty(suggestions) && (
      <>
        <div className="px-3 pt-2 pb-1 text-xs text-muted-foreground font-medium">Suggestions</div>
        <ScrollArea className="max-h-64 [&>div]:max-h-64">
          <CommandGroup className="pb-1">
            {suggestions.map((suggestion, idx) => (
              <CommandItem
                className="text-secondary-foreground text-xs"
                key={`${suggestion.type}-${suggestion.field || ""}-${suggestion.value}-${idx}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onSelect={() => onSelect(suggestion)}
              >
                <SuggestionItem suggestion={suggestion} />
              </CommandItem>
            ))}
          </CommandGroup>
        </ScrollArea>
      </>
    )}
    {isEmpty(suggestions) &&
        (isLoading || inputValue ? (
          <div className="flex items-center gap-2 p-2">
            <Skeleton className="h-5 w-8" />
            <Skeleton className="h-5 w-32" />
          </div>
        ) : (
          <CommandGroup>
            <CommandItem
              value=""
              className="text-secondary-foreground text-xs"
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
            >
              No results found.
            </CommandItem>
          </CommandGroup>
        ))}
  </div>
);

export default memo(FilterSuggestions);


