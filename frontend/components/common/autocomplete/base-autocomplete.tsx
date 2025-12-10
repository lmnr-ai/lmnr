"use client";

import { Command as CommandPrimitive } from "cmdk";
import { isEmpty } from "lodash";
import { Search } from "lucide-react";
import { KeyboardEvent, memo, useCallback, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { AutocompleteSuggestion } from "@/lib/actions/autocomplete";
import { cn } from "@/lib/utils";

interface BaseAutocompleteProps {
  suggestions: AutocompleteSuggestion[];
  inputValue: string;
  onInputChange: (value: string) => void;
  onSelect: (suggestion: AutocompleteSuggestion) => void;
  onSubmit?: () => void;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  listClassName?: string;
  wrapperClassName?: string;
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
  isLoading = false,
  inputValue,
}: {
  suggestions: AutocompleteSuggestion[];
  onSelect: (suggestion: AutocompleteSuggestion) => void;
  isLoading: boolean;
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
  </>
);

const BaseAutocomplete = ({
  suggestions,
  inputValue,
  onInputChange,
  onSelect,
  onSubmit,
  isLoading = false,
  placeholder = "Search...",
  className,
  inputClassName,
  listClassName,
  wrapperClassName,
}: BaseAutocompleteProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setOpen] = useState(false);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!isOpen) {
        setOpen(true);
      }

      if (event.key === "Enter") {
        if (isOpen && suggestions.length > 0) {
          return;
        }
        if (inputValue !== "" && onSubmit) {
          onSubmit();
          setOpen(false);
        }
      }

      if (event.key === "Escape") {
        inputRef.current?.blur();
      }
    },
    [isOpen, suggestions.length, inputValue, onSubmit]
  );

  const handleBlur = useCallback(() => {
    setOpen(false);
    if (onSubmit) {
      onSubmit();
    }
  }, [onSubmit]);

  const handleSelectOption = useCallback(
    (suggestion: AutocompleteSuggestion) => {
      onSelect(suggestion);
      setOpen(false);
      setTimeout(() => {
        inputRef?.current?.focus();
      }, 0);
    },
    [onSelect]
  );

  return (
    <CommandPrimitive
      loop
      shouldFilter={false}
      onKeyDown={handleKeyDown}
      className={cn("flex flex-col flex-1 border-b-0 h-fit", className)}
    >
      <div
        className={cn(
          "flex items-center gap-2 px-2 rounded-md [&>div]:border-b-0 focus-within:ring-border/50 focus-within:ring-[3px] box-border not-focus-within:bg-accent transition duration-300",
          wrapperClassName
        )}
      >
        <Search className="text-secondary-foreground size-3.5 min-w-3.5" />
        <CommandPrimitive.Input
          ref={inputRef}
          className={cn(
            "flex h-7 w-full rounded-md bg-transparent py-1 text-xs outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
            inputClassName
          )}
          value={inputValue}
          onValueChange={onInputChange}
          onBlur={handleBlur}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
        />
      </div>
      <div className={cn("relative ", isOpen ? "block" : "hidden")}>
        <CommandList
          className={cn(
            "animate-in fade-in-0 zoom-in-95 absolute top-0 z-50 w-full bg-secondary outline-none rounded-md border max-h-64 mt-1",
            listClassName
          )}
        >
          <SuggestionsList
            suggestions={suggestions}
            onSelect={handleSelectOption}
            isLoading={isLoading}
            inputValue={inputValue}
          />
        </CommandList>
      </div>
    </CommandPrimitive>
  );
};

export default memo(BaseAutocomplete);
