import { Search } from "lucide-react";
import React, { type RefObject, useCallback, useRef, useState } from "react";

import { useSpanSearchState } from "@/components/traces/span-view/span-search-context.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";

const SEARCH_DEBOUNCE_MS = 300;

interface SpanViewSearchBarProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  ref: RefObject<HTMLInputElement | null>;
}

const SpanViewSearchBar = ({ open, setOpen, ref }: SpanViewSearchBarProps) => {
  const searchState = useSpanSearchState();

  const [inputValue, setInputValue] = useState(searchState?.searchTerm ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const searchTerm = searchState?.searchTerm ?? "";
  const setSearchTerm = searchState?.setSearchTerm;
  const totalMatches = searchState?.totalMatches ?? 0;
  const currentIndex = searchState?.currentIndex ?? 0;
  const goToNext = searchState?.goToNext;
  const goToPrev = searchState?.goToPrev;

  const clearSearch = useCallback(() => {
    clearTimeout(debounceRef.current);
    setInputValue("");
    setSearchTerm?.("");
  }, [setSearchTerm]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        clearTimeout(debounceRef.current);
        const value = e.currentTarget.value;
        if (value === searchTerm) {
          goToNext?.();
        } else {
          setSearchTerm?.(value);
        }
      } else if (e.key === "Escape") {
        clearSearch();
        setOpen(false);
      }
    },
    [searchTerm, goToNext, setSearchTerm, clearSearch, setOpen]
  );

  const handleClear = useCallback(() => {
    clearSearch();
    setOpen(false);
  }, [clearSearch, setOpen]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setInputValue(value);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setSearchTerm?.(value);
      }, SEARCH_DEBOUNCE_MS);
    },
    [setSearchTerm]
  );

  if (!searchState) return null;

  const isExpanded = inputValue.length > 0 || open;

  if (!isExpanded) return null;

  return (
    <div className="flex items-center gap-1 p-2">
      <div className="relative flex-1">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          ref={ref}
          placeholder="Search in span..."
          value={inputValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          className="pl-7 pr-8 text-xs placeholder:text-xs"
          autoFocus
        />
        <Button
          icon="x"
          variant="ghost"
          size="icon"
          className="absolute right-0 top-1/2 -translate-y-1/2"
          onClick={handleClear}
        />
      </div>
      {totalMatches > 0 && (
        <>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {currentIndex === 0 ? `${totalMatches} found` : `${currentIndex} of ${totalMatches}`}
          </span>
          <Button className="size-5" icon="chevronUp" variant="ghost" size="icon" onClick={goToPrev} />
          <Button className="size-5" icon="chevronDown" variant="ghost" size="icon" onClick={goToNext} />
        </>
      )}
    </div>
  );
};

export default SpanViewSearchBar;
