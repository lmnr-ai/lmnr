"use client";

import { Command as CommandPrimitive } from "cmdk";
import { debounce, isEmpty, isNil, uniqBy } from "lodash";
import { Search } from "lucide-react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { KeyboardEvent, memo, useCallback, useMemo, useRef, useState } from "react";
import useSWR from "swr";

import { Badge } from "@/components/ui/badge";
import { CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { DatatableFilter, Operator } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { AutocompleteSuggestion } from "@/lib/actions/autocomplete";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { cn, swrFetcher } from "@/lib/utils";

interface AutocompleteSearchInputProps {
  getStaticSuggestions: (prefix: string) => AutocompleteSuggestion[];
  resource: "traces" | "spans";
  placeholder?: string;
  posthogEventName: string;
  additionalSearchParams?: Record<string, string | string[]>;
  maxSuggestions?: number;
  className?: string;
}

const SuggestionItem = ({ suggestion }: { suggestion: AutocompleteSuggestion }) => (
  <div className="flex items-center gap-2 text-secondary-foreground">
    {suggestion.field === "search" ? (
      <>
        <span>Full text search:</span>
        <span className="font-medium">{suggestion.value}</span>
      </>
    ) : (
      <>
        <Badge variant="outline" className="font-semibold text-[10px] py-0.5 px-1">
          {suggestion.field}
        </Badge>
        <span>{suggestion.value}</span>
      </>
    )}
  </div>
);

const SuggestionsList = ({
  suggestions,
  onSelect,
  isPendingDebounce,
  inputValue,
}: {
  suggestions: AutocompleteSuggestion[];
  onSelect: (suggestion: AutocompleteSuggestion) => void;
  isPendingDebounce: boolean;
  inputValue: string;
}) => (
  <>
    {!isEmpty(suggestions) && (
      <CommandGroup>
        {suggestions.map((suggestion) => (
          <CommandItem
            className="text-secondary-foreground text-xs"
            key={`${suggestion.field}:${suggestion.value}`}
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
    )}
    {isEmpty(suggestions) &&
      (isPendingDebounce || inputValue ? (
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
  </>
);

const AutocompleteSearchInput = ({
  getStaticSuggestions,
  resource,
  placeholder = "Search...",
  posthogEventName,
  additionalSearchParams = {},
  maxSuggestions = 15,
  className,
}: AutocompleteSearchInputProps) => {
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
  const [isPendingDebounce, setIsPendingDebounce] = useState(false);

  const debouncedSetFetchPrefix = useMemo(() => debounce(setFetchPrefix, 400), []);

  const handleInputChange = useCallback(
    (value: string) => {
      setInputValue(value);
      setIsPendingDebounce(true);
      debouncedSetFetchPrefix(value);
    },
    [debouncedSetFetchPrefix]
  );

  const fetchUrl = useMemo(
    () => `/api/projects/${params.projectId}/${resource}/autocomplete?prefix=${encodeURIComponent(fetchPrefix)}`,
    [fetchPrefix, params.projectId, resource]
  );

  const { data: { suggestions } = { suggestions: [] } } = useSWR<{
    suggestions: AutocompleteSuggestion[];
  }>(fetchUrl, swrFetcher, {
    fallbackData: { suggestions: [] },
    keepPreviousData: true,
    onSuccess: () => setIsPendingDebounce(false),
  });

  const filteredSuggestions = useMemo(() => {
    const staticSuggestions = getStaticSuggestions(inputValue);

    const searchTerm = inputValue.trim();
    const filteredApiSuggestions = searchTerm
      ? suggestions.filter((suggestion) => suggestion.value.toLowerCase().includes(searchTerm.toLowerCase()))
      : suggestions;

    const combined = [...filteredApiSuggestions, ...staticSuggestions];
    const unique = uniqBy(combined, (s) => `${s.field}:${s.value}`);

    const results = unique.slice(0, maxSuggestions - 1);
    if (searchTerm) {
      return [{ field: "search", value: searchTerm }, ...results];
    }

    return unique.slice(0, maxSuggestions);
  }, [inputValue, suggestions, getStaticSuggestions, maxSuggestions]);

  const submit = useCallback(
    (value: string) => {
      lastSubmittedValueRef.current = value;

      const params = new URLSearchParams(searchParams.toString());
      if (isNil(value) || value === "") {
        params.delete("search");
      } else {
        params.set("search", value);
      }

      // Apply additional search params
      Object.entries(additionalSearchParams).forEach(([key, val]) => {
        params.delete(key);
        if (Array.isArray(val)) {
          val.forEach((v) => params.append(key, v));
        } else {
          params.set(key, val);
        }
      });

      router.push(`${pathName}?${params.toString()}`);
      if (isFeatureEnabled(Feature.POSTHOG)) {
        posthog.capture(posthogEventName, {
          searchParams: searchParams.toString(),
        });
      }
    },
    [pathName, posthog, router, searchParams, posthogEventName, additionalSearchParams]
  );

  const applyFilter = useCallback(
    (field: string, value: string) => {
      lastSubmittedValueRef.current = "";
      setInputValue("");
      setFetchPrefix("");

      const params = new URLSearchParams(searchParams);
      params.delete("search");
      const filter: DatatableFilter = { column: field, operator: Operator.Eq, value };
      params.append("filter", JSON.stringify(filter));
      params.delete("pageNumber");
      params.append("pageNumber", "0");
      router.push(`${pathName}?${params.toString()}`);
    },
    [pathName, router, searchParams]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!isOpen) {
        setOpen(true);
      }

      if (event.key === "Enter") {
        if (isOpen && filteredSuggestions.length > 0) {
          return;
        }
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
      if (suggestion.field === "search") {
        setInputValue(suggestion.value);
        setFetchPrefix(suggestion.value);
        submit(suggestion.value);
      } else {
        applyFilter(suggestion.field, suggestion.value);
      }
      setOpen(false);
      setTimeout(() => {
        inputRef?.current?.focus();
      }, 0);
    },
    [submit, applyFilter]
  );

  return (
    <CommandPrimitive
      loop
      shouldFilter={false}
      onKeyDown={handleKeyDown}
      className="flex flex-col flex-1 border-b-0 mr-1 h-fit"
    >
      <div className="flex items-center gap-2 px-2 rounded-md [&>div]:border-b-0 focus-within:ring-border/50 focus-within:ring-[3px] box-border max-h-7 not-focus-within:bg-accent transition duration-300">
        <Search className="text-secondary-foreground size-3.5 min-w-3.5" />
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
          placeholder={placeholder}
        />
      </div>
      <div className={cn("relative ", isOpen ? "block" : "hidden")}>
        <CommandList
          className={cn(
            "animate-in fade-in-0 zoom-in-95 absolute top-0 z-50 w-full bg-secondary outline-none rounded-md border max-h-64 mt-1"
          )}
        >
          <SuggestionsList
            suggestions={filteredSuggestions}
            onSelect={handleSelectOption}
            isPendingDebounce={isPendingDebounce}
            inputValue={inputValue}
          />
        </CommandList>
      </div>
    </CommandPrimitive>
  );
};

export default memo(AutocompleteSearchInput);
