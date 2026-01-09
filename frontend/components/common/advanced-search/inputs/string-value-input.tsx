"use client";

import { ChangeEvent, KeyboardEvent, Ref, useCallback, useImperativeHandle, useMemo, useRef } from "react";

import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

import { useFilterSearch } from "../context";
import { FocusableRef, FocusMode } from "../types";

interface StringValueInputProps {
  tagId: string;
  suggestions: string[];
  focused: boolean;
  onExitEditLeft?: () => void;
  onExitEditRight?: () => void;
  mode: FocusMode;
  ref?: Ref<FocusableRef>;
}

const inputClassName = cn(
  "h-6 px-2 py-0 text-xs bg-transparent text-secondary-foreground outline-none",
  "placeholder:text-muted-foreground min-w-fit max-w-60",
  "focus:bg-accent/50",
  "[field-sizing:content]"
);

const StringValueInput = ({
  tagId,
  suggestions,
  focused,
  onExitEditLeft,
  onExitEditRight,
  mode,
  ref,
}: StringValueInputProps) => {
  const { state, updateTagValue, submit, focusMainInput } = useFilterSearch();
  const tag = useMemo(() => state.tags.find((t) => t.id === tagId), [state.tags, tagId]);

  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      updateTagValue(tagId, e.target.value);
    },
    [tagId, updateTagValue]
  );

  const handleComplete = useCallback(() => {
    submit();
    focusMainInput();
  }, [submit, focusMainInput]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // In edit mode, allow normal input behavior
      if (mode === "edit") {
        // Let Command handle arrow keys when suggestions are open
        if (focused && suggestions.length > 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
          return;
        }

        if (e.key === "Enter" && (!focused || suggestions.length === 0)) {
          e.preventDefault();
          handleComplete();
          return;
        }

        const input = e.target as HTMLInputElement;

        if (e.key === "ArrowLeft" && onExitEditLeft) {
          if (input.selectionStart === null || input.selectionStart === 0) {
            e.preventDefault();
            onExitEditLeft();
          }
          return;
        }

        if (e.key === "ArrowRight" && onExitEditRight) {
          if (input.selectionStart === null || input.selectionStart === input.value.length) {
            e.preventDefault();
            onExitEditRight();
          }
          return;
        }
      }
    },
    [mode, focused, suggestions.length, handleComplete, onExitEditLeft, onExitEditRight]
  );

  const handleSuggestionSelect = useCallback(
    (suggestionValue: string) => {
      updateTagValue(tagId, suggestionValue);
      handleComplete();
    },
    [tagId, updateTagValue, handleComplete]
  );

  if (!tag) return null;

  return (
    <Command
      className="relative flex items-center overflow-visible bg-transparent w-fit rounded-none"
      shouldFilter={false}
    >
      <input
        ref={inputRef}
        type="text"
        value={tag.value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="..."
        className={inputClassName}
        tabIndex={mode === "edit" ? 0 : -1}
      />
      {mode === "edit" && focused && suggestions.length > 0 && (
        <div className="absolute top-full left-0 mt-1 z-50 w-[200px] bg-popover border shadow-md overflow-hidden">
          <CommandList className="max-h-[200px]">
            <CommandEmpty className="py-2 text-center text-xs text-muted-foreground">No suggestions</CommandEmpty>
            <CommandGroup>
              {suggestions.map((suggestion) => (
                <CommandItem
                  key={suggestion}
                  value={suggestion}
                  onSelect={() => handleSuggestionSelect(suggestion)}
                  className="text-xs cursor-pointer"
                >
                  <span className="truncate">{suggestion}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </div>
      )}
    </Command>
  );
};

export default StringValueInput;
