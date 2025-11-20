import { Command as CommandPrimitive } from "cmdk";
import { debounce, isEmpty, isNil } from "lodash";
import { Search } from "lucide-react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import React, { KeyboardEvent, memo, useCallback, useMemo, useRef, useState } from "react";
import useSWR from "swr";

import { CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { AutocompleteSuggestion } from "@/lib/actions/autocomplete";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { cn } from "@/lib/utils";

const SearchTracesInput = ({ className }: { className?: string }) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const params = useParams();
  const posthog = usePostHog();

  const inputRef = useRef<HTMLInputElement>(null);
  const lastSubmittedValueRef = useRef<string>(searchParams.get("search") ?? "");
  const [isOpen, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(searchParams.get("search") ?? "");
  const [fetchPrefix, setFetchPrefix] = useState(searchParams.get("search") ?? "");

  const debouncedSetFetchPrefix = useMemo(() => debounce(setFetchPrefix, 400), []);

  const handleInputChange = useCallback(
    (value: string) => {
      setInputValue(value);
      debouncedSetFetchPrefix(value);
    },
    [debouncedSetFetchPrefix]
  );

  const fetchUrl = useMemo(
    () => `/api/projects/${params.projectId}/traces/autocomplete?prefix=${encodeURIComponent(fetchPrefix)}`,
    [fetchPrefix, params.projectId]
  );

  const { data: { suggestions } = { suggestions: [] }, isLoading } = useSWR<{ suggestions: AutocompleteSuggestion[] }>(
    fetchUrl,
    async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch suggestions");
      }
      return response.json();
    },
    {
      fallbackData: { suggestions: [] },
      keepPreviousData: true,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  const filteredSuggestions = useMemo(() => {
    if (!inputValue) return suggestions;
    const lowerInput = inputValue.toLowerCase();
    return suggestions.filter((suggestion) => suggestion.value.toLowerCase().includes(lowerInput));
  }, [suggestions, inputValue]);

  const submit = useCallback(
    (value: string) => {
      lastSubmittedValueRef.current = value;

      const params = new URLSearchParams(searchParams.toString());
      if (isNil(value) || value === "") {
        params.delete("search");
      } else {
        params.set("search", value);
      }

      if (params.get("searchIn")) {
        params.delete("searchIn");
      }

      params.append("searchIn", "input");
      params.append("searchIn", "output");

      router.push(`${pathName}?${params.toString()}`);
      if (isFeatureEnabled(Feature.POSTHOG)) {
        posthog.capture("traces_list_searched", {
          searchParams: searchParams.toString(),
        });
      }
    },
    [pathName, posthog, router, searchParams]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!isOpen) {
        setOpen(true);
      }

      if (event.key === "Enter") {
        // If dropdown is open with suggestions, let Command handle the selection
        if (isOpen && filteredSuggestions.length > 0) {
          return;
        }
        // Otherwise, submit the current input value
        if (inputValue !== "") {
          submit(inputValue);
          setOpen(false);
        }
      }

      if (event.key === "Escape") {
        inputRef.current?.blur();
      }
    },
    [isOpen, filteredSuggestions.length, inputValue, submit]
  );

  const handleBlur = useCallback(() => {
    setOpen(false);
    if (inputValue !== lastSubmittedValueRef.current) {
      submit(inputValue);
    }
  }, [inputValue, submit]);

  const handleSelectOption = useCallback(
    (suggestion: AutocompleteSuggestion) => {
      setInputValue(suggestion.value);
      setFetchPrefix(suggestion.value);
      submit(suggestion.value);
      setOpen(false);
      setTimeout(() => {
        inputRef?.current?.focus();
      }, 0);
    },
    [submit]
  );

  return (
    <CommandPrimitive onKeyDown={handleKeyDown} className="flex flex-col flex-1 border-b-0 mr-1">
      <div className="flex items-center gap-2 px-2 rounded-md [&>div]:border-b-0 focus-within:ring-border/50 focus-within:ring-[3px] box-border max-h-7 not-focus-within:bg-accent transition">
        <Search className="text-secondary-foreground size-3.5" />
        <CommandPrimitive.Input
          ref={inputRef}
          className={cn(
            "flex h-7 w-full rounded-md bg-transparent py-1 text-xs outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          value={inputValue}
          onValueChange={handleInputChange}
          onBlur={handleBlur}
          onFocus={() => setOpen(true)}
          placeholder="Search in traces..."
        />
      </div>
      <div className="relative mt-1">
        <div
          className={cn(
            "animate-in fade-in-0 zoom-in-95 absolute top-0 z-20 w-full rounded-md bg-secondary outline-none",
            isOpen ? "block" : "hidden"
          )}
        >
          <CommandList className="rounded-md max-h-40 border">
            <CommandGroup>
              {!isEmpty(filteredSuggestions) &&
                !isLoading &&
                filteredSuggestions.map((suggestion, index) => (
                  <CommandItem
                    className="text-secondary-foreground text-xs"
                    key={index}
                    value={suggestion.value}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onSelect={() => handleSelectOption(suggestion)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-center text-[10px] underline font-medium text-primary">
                        {suggestion.field}
                      </span>
                      <span>{suggestion.value}</span>
                    </div>
                  </CommandItem>
                ))}
              {isLoading && (
                <CommandItem>
                  <Skeleton className="h-7 w-full" />
                </CommandItem>
              )}
            </CommandGroup>
            {isEmpty(filteredSuggestions) && !isLoading && (
              <CommandEmpty className="p-2 text-xs text-secondary-foreground">No results found.</CommandEmpty>
            )}
          </CommandList>
        </div>
      </div>
    </CommandPrimitive>
  );
};

export default memo(SearchTracesInput);
