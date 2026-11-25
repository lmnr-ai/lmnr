"use client";

import { type MouseEvent, type Ref, useCallback } from "react";

import { EMPTINESS_OPTIONS, Operator } from "@/lib/actions/common/operators";
import { cn } from "@/lib/utils";

import { useAdvancedSearchContext, useTag, useTagFocus } from "../store";
import { type ColumnFilter, type FocusableRef, type FocusMode } from "../types";
import ArrayValueInput from "./array";
import EnumValueInput from "./enum";
import JsonValueInput from "./json";
import NumberValueInput from "./number";
import StringValueInput from "./string";

const BOOLEAN_OPTIONS = [
  { value: "true", label: "true" },
  { value: "false", label: "false" },
];

interface ValueInputProps {
  tagId: string;
  columnFilter: ColumnFilter;
  suggestions: string[];
  focused: boolean;
  mode: FocusMode;
  ref?: Ref<FocusableRef>;
}

const ValueInput = ({ tagId, columnFilter, suggestions, focused, mode, ref }: ValueInputProps) => {
  const focus = useTagFocus(tagId);
  const setFocus = useAdvancedSearchContext((state) => state.setFocus);
  const operator = useTag(tagId)?.operator;

  const dataType = columnFilter.dataType;

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      // Native focus keeps the caret where clicked; programmatic focus jumps it to the end.
      if (e.target instanceof HTMLInputElement) return;
      setFocus({ tagId, position: "value", mode: "edit" });
      if (ref && typeof ref !== "function" && ref.current) {
        ref.current.focus();
      }
    },
    [tagId, setFocus, ref]
  );

  const isEditing = focus?.position === "value" && focus.mode === "edit";
  const handleFocus = useCallback(() => {
    if (!isEditing) setFocus({ tagId, position: "value", mode: "edit" });
  }, [isEditing, tagId, setFocus]);

  const wrapperClassName = cn(
    "font-medium h-5.5 flex items-center justify-center",
    focus?.position === "value" && "bg-primary/30"
  );

  const renderInput = () => {
    if (operator === Operator.Is) {
      return <EnumValueInput ref={ref} tagId={tagId} options={EMPTINESS_OPTIONS} />;
    }
    switch (dataType) {
      case "enum":
        return <EnumValueInput ref={ref} tagId={tagId} options={columnFilter.options} />;

      case "boolean":
        return <EnumValueInput ref={ref} tagId={tagId} options={BOOLEAN_OPTIONS} />;

      case "number":
        return <NumberValueInput ref={ref} tagId={tagId} mode={mode} />;

      case "json":
        return <JsonValueInput ref={ref} tagId={tagId} mode={mode} />;

      case "array":
        return <ArrayValueInput ref={ref} tagId={tagId} suggestions={suggestions} focused={focused} mode={mode} />;

      default: // string
        return <StringValueInput ref={ref} tagId={tagId} suggestions={suggestions} focused={focused} mode={mode} />;
    }
  };

  return (
    <div
      className={wrapperClassName}
      onMouseDown={handleMouseDown}
      onFocus={handleFocus}
      onClick={(e) => e.stopPropagation()}
    >
      {renderInput()}
    </div>
  );
};

export default ValueInput;
