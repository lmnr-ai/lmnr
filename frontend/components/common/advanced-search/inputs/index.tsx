"use client";

import { type Ref, useCallback } from "react";

import { cn } from "@/lib/utils";

import { useAdvancedSearchContext } from "../store";
import { type ColumnFilter, type FocusableRef, type FocusMode } from "../types";
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

const ValueInput = ({ tagId, columnFilter, suggestions, focused, mode, ref }: ValueInputProps) => {
  const getTagFocusState = useAdvancedSearchContext((state) => state.getTagFocusState);
  const setTagFocusState = useAdvancedSearchContext((state) => state.setTagFocusState);

  const focusState = getTagFocusState(tagId);
  const dataType = columnFilter.dataType;

  const handleMouseDown = useCallback(() => {
    setTagFocusState(tagId, { type: "value", mode: "edit" });
    if (ref && typeof ref !== "function" && ref.current) {
      ref.current.focus();
    }
  }, [tagId, setTagFocusState, ref]);
  const wrapperClassName = cn("font-medium h-5.5", focusState.type === "value" && "bg-primary/30");

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
};

export default ValueInput;
