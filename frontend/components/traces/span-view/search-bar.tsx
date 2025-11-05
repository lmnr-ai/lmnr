import { debounce } from "lodash";
import { Search } from "lucide-react";
import React, { RefObject, useEffect, useMemo } from "react";

import { useSpanSearchContext } from "@/components/traces/span-view/span-search-context.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";

interface SpanViewSearchBarProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  ref: RefObject<HTMLInputElement | null>;
}
const SpanViewSearchBar = ({ open, setOpen, ref }: SpanViewSearchBarProps) => {
  const searchContext = useSpanSearchContext();

  const debouncedSetSearchTerm = useMemo(
    () => (searchContext ? debounce(searchContext.setSearchTerm, 300) : null),
    [searchContext]
  );

  useEffect(
    () => () => {
      debouncedSetSearchTerm?.cancel();
    },
    [debouncedSetSearchTerm]
  );

  if (!searchContext) return null;

  const { searchTerm, setSearchTerm, totalMatches, currentIndex, goToNext, goToPrev } = searchContext;
  const isExpanded = searchTerm.length > 0 || open;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      debouncedSetSearchTerm?.cancel();
      setSearchTerm(e.currentTarget.value);
      goToNext();
    } else if (e.key === "Escape") {
      setSearchTerm("");
      setOpen(false);
    }
  };

  const handleClear = () => {
    debouncedSetSearchTerm?.cancel();
    setSearchTerm("");
    setOpen(false);
  };

  if (isExpanded) {
    return (
      <div className="flex items-center gap-1 p-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            ref={ref}
            placeholder="Search in span..."
            defaultValue={searchTerm || ""}
            onChange={(e) => debouncedSetSearchTerm?.(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pl-7 pr-8 text-xs placeholder:text-xs"
            autoFocus
          />
          {isExpanded && (
            <Button
              icon="x"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-1/2 -translate-y-1/2"
              onClick={handleClear}
            />
          )}
        </div>
        {totalMatches > 0 && (
          <>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {currentIndex}/{totalMatches}
            </span>
            <Button icon="chevronUp" variant="outline" size="icon" onClick={goToPrev} />
            <Button icon="chevronDown" variant="outline" size="icon" onClick={goToNext} />
          </>
        )}
      </div>
    );
  }
};

export default SpanViewSearchBar;
