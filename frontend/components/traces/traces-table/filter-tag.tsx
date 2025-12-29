"use client";

import { Command as CommandPrimitive } from "cmdk";
import { X } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { ColumnFilter, dataTypeOperationsMap } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Operator } from "@/lib/actions/common/operators";
import { cn } from "@/lib/utils";

export interface FilterTagState {
  field: string;
  operator: Operator;
  value: string;
  id: string;
}

interface FilterTagProps {
  tag: FilterTagState;
  columnFilter: ColumnFilter;
  onOperatorChange: (operator: Operator) => void;
  onValueChange: (value: string) => void;
  onRemove: () => void;
  onValueSubmit: () => void;
  isActive: boolean;
  onActivate: () => void;
  valueSuggestions: string[];
  showSuggestions: boolean;
  onValueInputChange: (value: string) => void;
  onSuggestionSelect: (value: string) => void;
}

const FilterTag = ({
  tag,
  columnFilter,
  onOperatorChange,
  onValueChange,
  onRemove,
  onValueSubmit,
  isActive,
  onActivate,
  valueSuggestions,
  showSuggestions,
  onValueInputChange,
  onSuggestionSelect,
}: FilterTagProps) => {
  const valueInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [localValue, setLocalValue] = useState(tag.value);
  const operations = dataTypeOperationsMap[columnFilter.dataType];

  useEffect(() => {
    setLocalValue(tag.value);
  }, [tag.value]);

  useEffect(() => {
    if (isActive && valueInputRef.current) {
      valueInputRef.current.focus();
    }
  }, [isActive]);

  const handleValueInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setLocalValue(newValue);
      onValueInputChange(newValue);
    },
    [onValueInputChange]
  );

  const handleValueBlur = useCallback(() => {
    onValueChange(localValue);
    onValueSubmit();
  }, [localValue, onValueChange, onValueSubmit]);

  const handleValueKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        if (showSuggestions && valueSuggestions.length > 0) {
          // Let CommandPrimitive handle it
          return;
        }
        e.preventDefault();
        onValueChange(localValue);
        onValueSubmit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        valueInputRef.current?.blur();
      }
    },
    [localValue, onValueChange, onValueSubmit, showSuggestions, valueSuggestions.length]
  );

  const handleOperatorClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
    },
    []
  );

  const handleRemoveClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRemove();
    },
    [onRemove]
  );

  const handleInputFocus = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      e.stopPropagation();
      onActivate();
    },
    [onActivate]
  );

  const handleInputClick = useCallback(
    (e: React.MouseEvent<HTMLInputElement>) => {
      e.stopPropagation();
    },
    []
  );

  const handleSuggestionSelect = useCallback(
    (value: string) => {
      setLocalValue(value);
      onSuggestionSelect(value);
    },
    [onSuggestionSelect]
  );

  return (
    <div ref={containerRef} className="relative inline-flex">
      <CommandPrimitive
        shouldFilter={false}
        className={cn(
          "inline-flex items-center gap-0.5 rounded-md border transition-colors h-7",
          "border-primary bg-primary/10 text-primary"
        )}
        onClick={onActivate}
      >
        {/* Field Badge */}
        <Badge variant="outlinePrimary" className="text-[10px] py-0 px-1.5 h-full rounded-r-none border-0 font-semibold flex items-center">
          {columnFilter.name}
        </Badge>

        {/* Operator Select */}
        <Select value={tag.operator} onValueChange={(value) => onOperatorChange(value as Operator)}>
          <SelectTrigger
            className={cn(
              "h-full w-fit min-w-[40px] px-1 border-0 bg-transparent text-primary font-medium rounded-none",
              "focus:ring-0 focus:ring-offset-0"
            )}
            onClick={handleOperatorClick}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {operations.map(({ key, label }) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Value Input */}
        <CommandPrimitive.Input
          ref={valueInputRef}
          value={localValue}
          onValueChange={(value) => {
            setLocalValue(value);
            onValueInputChange(value);
          }}
          onBlur={handleValueBlur}
          onKeyDown={handleValueKeyDown}
          onFocus={handleInputFocus}
          onClick={handleInputClick}
          placeholder="value..."
          className={cn(
            "h-full px-1.5 text-xs border-0 bg-transparent text-primary rounded-none",
            "focus-visible:ring-0 focus-visible:ring-offset-0 outline-hidden",
            "placeholder:text-primary/50 min-w-[60px] max-w-[200px]"
          )}
        />

        {/* Remove Button */}
        <button
          onClick={handleRemoveClick}
          className="h-full px-1.5 hover:opacity-70 transition-opacity flex items-center"
          type="button"
        >
          <X className="w-3 h-3 text-primary" />
        </button>

        {/* Suggestions dropdown for value input */}
        {showSuggestions && valueSuggestions.length > 0 && (
          <div className="absolute top-full left-0 mt-1 z-50">
            <CommandList className="animate-in fade-in-0 zoom-in-95 w-full min-w-[200px] max-w-[300px] bg-secondary border rounded-md shadow-md overflow-hidden">
              <div className="px-3 pt-2 pb-1 text-xs text-muted-foreground font-medium">Suggestions</div>
              <ScrollArea className="max-h-64 [&>div]:max-h-64">
                <CommandGroup className="pb-1">
                  {valueSuggestions.map((suggestion, idx) => (
                    <CommandItem
                      key={idx}
                      className="text-secondary-foreground text-xs"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onSelect={() => handleSuggestionSelect(suggestion)}
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-semibold text-[10px] py-0.5 px-1">
                          {columnFilter.name}
                        </Badge>
                        <span className="font-medium">{suggestion}</span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </ScrollArea>
            </CommandList>
          </div>
        )}
      </CommandPrimitive>
    </div>
  );
};

export default memo(FilterTag);

