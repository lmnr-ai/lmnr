"use client";

import { memo, Ref, useCallback } from "react";

import { cn } from "@/lib/utils";

import { useFilterSearch } from "../context";
import { ColumnFilter, FocusableRef, FocusMode } from "../types";
import BooleanValueInput from "./boolean";
import EnumValueInput from "./enum";
import JsonValueInput from "./json";
import NumberValueInput from "./number";
import StringValueInput from "./string";

interface ValueInputProps {
  tagId: string;
  columnFilter: ColumnFilter;
  suggestions: string[];
  focused: boolean;
  mode: FocusMode;
  ref?: Ref<FocusableRef>;
}

const ValueInput = memo(({ tagId, columnFilter, suggestions, focused, mode, ref }: ValueInputProps) => {
  const { getTagFocusState, setTagFocusState } = useFilterSearch();
  const focusState = getTagFocusState(tagId);
  const dataType = columnFilter.dataType;

  const handleMouseDown = useCallback(() => {
    setTagFocusState(tagId, { type: "value", mode: "edit" });
    if (ref && typeof ref !== "function" && ref.current) {
      ref.current.focus();
    }
  }, [tagId, setTagFocusState, ref]);
  const wrapperClassName = cn(focusState.type === "value" && "bg-accent");

  const renderInput = () => {
    switch (dataType) {
      case "enum":
        return <EnumValueInput ref={ref} tagId={tagId} options={columnFilter.options} />;

      case "boolean":
        return <BooleanValueInput ref={ref} tagId={tagId} focused={focused} mode={mode} />;

      case "number":
        return <NumberValueInput ref={ref} tagId={tagId} mode={mode} />;

      case "json":
        return <JsonValueInput ref={ref} tagId={tagId} mode={mode} />;

      default: // string
        return <StringValueInput ref={ref} tagId={tagId} suggestions={suggestions} focused={focused} mode={mode} />;
    }
  };

  return (
    <div className={wrapperClassName} onMouseDown={handleMouseDown} onClick={(e) => e.stopPropagation()}>
      {renderInput()}
    </div>
  );
});

ValueInput.displayName = "ValueInput";

export default ValueInput;
