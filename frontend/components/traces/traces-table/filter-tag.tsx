"use client";

import { X } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ColumnFilter, dataTypeOperationsMap } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
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
}: FilterTagProps) => {
  const valueInputRef = useRef<HTMLInputElement>(null);
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
        e.preventDefault();
        onValueChange(localValue);
        onValueSubmit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        valueInputRef.current?.blur();
      }
    },
    [localValue, onValueChange, onValueSubmit]
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

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md border transition-colors h-7",
        "border-primary bg-primary/10 text-primary"
      )}
      onClick={onActivate}
    >
      {/* Field Badge */}
      <Badge variant="outlinePrimary" className="text-[10px] py-0 px-1 font-semibold">
        {columnFilter.name}
      </Badge>

      {/* Operator Select */}
      <Select value={tag.operator} onValueChange={(value) => onOperatorChange(value as Operator)}>
        <SelectTrigger
          className={cn(
            "h-5 w-fit min-w-[40px] px-1 border-0 bg-transparent text-primary font-medium",
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
      <div className="relative">
        <Input
          ref={valueInputRef}
          type="text"
          value={localValue}
          onChange={handleValueInputChange}
          onBlur={handleValueBlur}
          onKeyDown={handleValueKeyDown}
          onFocus={onActivate}
          placeholder="value..."
          className={cn(
            "h-5 px-1 py-0 text-xs border-0 bg-transparent text-primary",
            "focus-visible:ring-0 focus-visible:ring-offset-0",
            "placeholder:text-primary/50 min-w-[60px] max-w-[200px]"
          )}
        />
        {/* Suggestions dropdown for value input */}
        {showSuggestions && valueSuggestions.length > 0 && (
          <div className="absolute top-full left-0 mt-1 z-50 w-full min-w-[150px] max-w-[300px] bg-secondary border rounded-md shadow-md max-h-48 overflow-auto">
            {valueSuggestions.map((suggestion, idx) => (
              <div
                key={idx}
                className="px-2 py-1.5 text-xs hover:bg-accent cursor-pointer text-secondary-foreground"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setLocalValue(suggestion);
                  onValueChange(suggestion);
                  onValueSubmit();
                }}
              >
                {suggestion}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Remove Button */}
      <button
        onClick={handleRemoveClick}
        className="p-0 h-fit hover:opacity-70 transition-opacity"
        type="button"
      >
        <X className="w-3 h-3 text-primary" />
      </button>
    </div>
  );
};

export default memo(FilterTag);

