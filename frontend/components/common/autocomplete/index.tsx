"use client";

import { isNil, uniqBy } from "lodash";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import useSWR from "swr";

import BaseAutocomplete from "@/components/common/autocomplete/base-autocomplete";
import { AutocompleteSuggestion } from "@/lib/actions/autocomplete";
import { Filter } from "@/lib/actions/common/filters.ts";
import { Operator } from "@/lib/actions/common/operators.ts";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { swrFetcher } from "@/lib/utils";

interface AutocompleteSearchInputProps {
  getStaticSuggestions: (prefix: string) => AutocompleteSuggestion[];
  resource: "traces" | "spans";
  placeholder?: string;
  posthogEventName: string;
  additionalSearchParams?: Record<string, string | string[]>;
  maxSuggestions?: number;
  className?: string;
  inputClassName?: string;
}

const AutocompleteSearchInput = ({
  getStaticSuggestions,
  resource,
  placeholder = "Search...",
  posthogEventName,
  additionalSearchParams = {},
  maxSuggestions = 15,
  inputClassName,
  className,
}: AutocompleteSearchInputProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const params = useParams();
  const posthog = usePostHog();

  const lastSubmittedValueRef = useRef<string>(searchParams.get("search") ?? "");
  const [inputValue, setInputValue] = useState(searchParams.get("search") ?? "");
  const debouncedInputValue = useDebounce(inputValue, 400);

  const fetchUrl = useMemo(
    () =>
      `/api/projects/${params.projectId}/${resource}/autocomplete?prefix=${encodeURIComponent(debouncedInputValue)}`,
    [debouncedInputValue, params.projectId, resource]
  );

  const { data: { suggestions } = { suggestions: [] }, isLoading } = useSWR<{
    suggestions: AutocompleteSuggestion[];
  }>(fetchUrl, swrFetcher, {
    fallbackData: { suggestions: [] },
    keepPreviousData: true,
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
      return [...results, { field: "search", value: searchTerm }];
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

      const params = new URLSearchParams(searchParams);
      params.delete("search");
      const filter: Filter = { column: field, operator: Operator.Eq, value };
      params.append("filter", JSON.stringify(filter));
      params.delete("pageNumber");
      params.append("pageNumber", "0");
      router.push(`${pathName}?${params.toString()}`);
    },
    [pathName, router, searchParams]
  );

  const handleSubmit = useCallback(() => {
    if (inputValue !== lastSubmittedValueRef.current) {
      submit(inputValue);
    }
  }, [inputValue, submit]);

  const handleSelectOption = useCallback(
    (suggestion: AutocompleteSuggestion) => {
      if (suggestion.field === "search") {
        setInputValue(suggestion.value);
        submit(suggestion.value);
      } else {
        applyFilter(suggestion.field, suggestion.value);
      }
    },
    [submit, applyFilter]
  );

  return (
    <BaseAutocomplete
      suggestions={filteredSuggestions}
      inputValue={inputValue}
      onInputChange={setInputValue}
      onSelect={handleSelectOption}
      onSubmit={handleSubmit}
      isLoading={isLoading || inputValue !== debouncedInputValue}
      placeholder={placeholder}
      inputClassName={inputClassName}
      className={className}
    />
  );
};

export default memo(AutocompleteSearchInput);
