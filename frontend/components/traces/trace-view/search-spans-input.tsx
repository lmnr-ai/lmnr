import { Search, X } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import React, { KeyboardEventHandler, memo, PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useTraceViewStoreContext } from "@/components/traces/trace-view/trace-view-store.tsx";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { useFiltersContextProvider } from "@/components/ui/infinite-datatable/ui/datatable-filter/context.tsx";
import { DatatableFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AutocompleteSuggestion } from "@/lib/actions/autocomplete";
import { cn } from "@/lib/utils";

const SearchSpansInput = ({
  submit,
  className,
  filterBoxClassName,
}: PropsWithChildren<{
  submit: (search: string, searchIn: string[], filters: DatatableFilter[]) => Promise<void>;
  className?: string;
  filterBoxClassName?: string;
}>) => {
  const [open, setOpen] = useState(false);
  const searchParams = useSearchParams();
  const params = useParams();
  const searchInQuery = searchParams.getAll("searchIn");
  const [searchIn, setSearchIn] = useState<string>(searchInQuery?.length === 1 ? searchInQuery?.[0] : "all");
  const { value: filters } = useFiltersContextProvider();
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);

  const { value, onChange } = useTraceViewStoreContext((state) => ({
    value: state.search,
    onChange: state.setSearch,
  }));

  const inputRef = useRef<HTMLInputElement>(null);
  const handleFocus = useCallback(() => {
    setOpen(true);
  }, []);

  const handleBlurInput = useCallback(() => {
    setTimeout(() => {
      setOpen(false);
    }, 200);
  }, []);

  const handleSubmit = useCallback(() => {
    submit(value, searchIn === "all" ? ["input", "output"] : [value], filters);
    inputRef?.current?.blur();
    setOpen(false);
  }, [filters, searchIn, submit, value]);

  const handleKeyPress: KeyboardEventHandler<HTMLInputElement> = useCallback(
    (e) => {
      if (e?.key === "Enter") {
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleClearInput = useCallback(() => {
    onChange("");
    setSuggestions([]);
    submit("", ["input", "output"], []);
  }, [onChange, submit]);

  const handleSuggestionSelect = useCallback((suggestion: AutocompleteSuggestion) => {
    onChange(suggestion.value);
    setOpen(false);
    submit(suggestion.value, searchIn === "all" ? ["input", "output"] : [suggestion.value], filters);
  }, [onChange, searchIn, filters, submit]);

  // Client-side filtering for instant feedback while debounced API call is pending
  const filteredSuggestions = useMemo(() => {
    if (!value || value.length < 2) return suggestions;
    const lowerInput = value.toLowerCase();
    return suggestions.filter((suggestion) =>
      suggestion.value.toLowerCase().includes(lowerInput)
    );
  }, [suggestions, value]);

  useEffect(() => {
    if (!value || value.length < 2) {
      setSuggestions([]);
      return;
    }

    const fetchSuggestions = async () => {
      try {
        const response = await fetch(
          `/api/projects/${params.projectId}/spans/autocomplete?prefix=${encodeURIComponent(value)}`
        );
        if (response.ok) {
          const data = await response.json();
          setSuggestions(data.suggestions);
        }
      } catch (error) {
        console.error("Failed to fetch autocomplete suggestions:", error);
      }
    };

    const debounce = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(debounce);
  }, [value, params.projectId]);

  return (
    <div className="flex flex-col top-0 sticky bg-background z-40 box-border">
      <Popover open={open}>
        <PopoverAnchor asChild>
          <div
            className={cn(
              "flex items-center gap-x-1 border px-2 rounded-md text-secondary-foreground min-w-[18px] py-[3.5px] box-border",
              { "ring-1": open },
              className
            )}
          >
            <Search size={18} className="text-secondary-foreground min-w-[18px]" />
            <Input
              className="focus-visible:ring-0 border-none max-h-8 px-1 bg-transparent"
              type="text"
              placeholder="Search"
              value={value}
              onKeyDown={handleKeyPress}
              ref={inputRef}
              onBlur={handleBlurInput}
              onChange={(e) => onChange(e.target.value)}
              onFocus={handleFocus}
            />
            {value && (
              <Button onClick={handleClearInput} variant="ghost" className="h-4 w-4" size="icon">
                <X size={18} className="text-secondary-foreground min-w-[18px]" />
              </Button>
            )}
          </div>
        </PopoverAnchor>
        <PopoverContent
          className="p-0"
          side="bottom"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
          sideOffset={4}
        >
          {filteredSuggestions.length > 0 ? (
            <Command>
              <CommandList>
                <CommandEmpty>No suggestions found</CommandEmpty>
                <CommandGroup>
                  {filteredSuggestions.map((suggestion, index) => (
                    <CommandItem
                      key={index}
                      value={suggestion.value}
                      onSelect={() => handleSuggestionSelect(suggestion)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-[10px] uppercase font-medium min-w-[40px]">
                          {suggestion.field}
                        </span>
                        <span>{suggestion.value}</span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          ) : (
            <div className="bg-secondary flex flex-col gap-2 p-2">
              <span className="text-secondary-foreground text-xs">Search in</span>
              <RadioGroup value={searchIn} onValueChange={setSearchIn} defaultValue="all">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="all" id="all" />
                  <Label htmlFor="all">All</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="input" id="input" />
                  <Label htmlFor="input">Input</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="output" id="output" />
                  <Label htmlFor="output">Output</Label>
                </div>
              </RadioGroup>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default memo(SearchSpansInput);
