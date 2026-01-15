import { Search } from "lucide-react";
import React, { type RefObject } from "react";

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

  if (!searchContext) return null;

  const { searchTerm, setSearchTerm, totalMatches, currentIndex, goToNext, goToPrev } = searchContext;
  const isExpanded = searchTerm.length > 0 || open;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      setSearchTerm(e.currentTarget.value);
      goToNext();
    } else if (e.key === "Escape") {
      setSearchTerm("");
      setOpen(false);
    }
  };

  const handleClear = () => {
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
            onChange={(e) => setSearchTerm(e.target.value)}
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
              {currentIndex} of {totalMatches}
            </span>
            <Button className="size-5" icon="chevronUp" variant="ghost" size="icon" onClick={goToPrev} />
            <Button className="size-5" icon="chevronDown" variant="ghost" size="icon" onClick={goToNext} />
          </>
        )}
      </div>
    );
  }
};

export default SpanViewSearchBar;
