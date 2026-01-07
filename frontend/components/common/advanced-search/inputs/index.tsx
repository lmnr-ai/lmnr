"use client";

import { memo, Ref, useCallback } from "react";

import { cn } from "@/lib/utils";

import { useFilterSearch } from "../context";
import { ColumnFilter, FocusableRef, FocusMode } from "../types";
import BooleanValueInput from "./boolean-value-input";
import EnumValueInput from "./enum-value-input";
import JsonValueInput from "./json-value-input";
import NumberValueInput from "./number-value-input";
import StringValueInput from "./string-value-input";

interface ValueInputProps {
  tagId: string;
  columnFilter: ColumnFilter;
  suggestions: string[];
  focused: boolean;
  onExitEditLeft?: () => void;
  onExitEditRight?: () => void;
  mode: FocusMode;
  ref?: Ref<FocusableRef>;
}

const ValueInput = memo(
  ({
    tagId,
    columnFilter,
    suggestions,
    focused,
    onExitEditLeft,
    onExitEditRight,
    mode,
    ref,
  }: ValueInputProps) => {
    const { getTagFocusState, setTagFocusState, setActiveTagId } = useFilterSearch();
    const focusState = getTagFocusState(tagId);
    const dataType = columnFilter.dataType;

    const handleClick = useCallback(() => {
      setActiveTagId(tagId);
      setTagFocusState(tagId, { type: "value", mode: "edit", showSuggestions: false, isSelectOpen: false });
      // Focus will be handled by the child input component via useImperativeHandle
      if (ref && typeof ref !== "function" && ref.current) {
        ref.current.focus();
      }
    }, [tagId, setActiveTagId, setTagFocusState, ref]);

    const wrapperClassName = cn(
      focusState.type === "value" && "mode" in focusState && focusState.mode === "nav" && "bg-accent/50"
    );

    const renderInput = () => {
      switch (dataType) {
        case "enum":
          if (columnFilter.dataType !== "enum") return null;
          return (
            <EnumValueInput
              ref={ref}
              tagId={tagId}
              options={columnFilter.options}
              focused={focused}
              onExitEditLeft={onExitEditLeft}
              onExitEditRight={onExitEditRight}
              mode={mode}
            />
          );

        case "boolean":
          return (
            <BooleanValueInput
              ref={ref}
              tagId={tagId}
              focused={focused}
              onExitEditLeft={onExitEditLeft}
              onExitEditRight={onExitEditRight}
              mode={mode}
            />
          );

        case "number":
          return (
            <NumberValueInput
              ref={ref}
              tagId={tagId}
              onExitEditLeft={onExitEditLeft}
              onExitEditRight={onExitEditRight}
              mode={mode}
            />
          );

        case "json":
          return (
            <JsonValueInput
              ref={ref}
              tagId={tagId}
              onExitEditLeft={onExitEditLeft}
              onExitEditRight={onExitEditRight}
              mode={mode}
            />
          );

        default: // string
          return (
            <StringValueInput
              ref={ref}
              tagId={tagId}
              suggestions={suggestions}
              focused={focused}
              onExitEditLeft={onExitEditLeft}
              onExitEditRight={onExitEditRight}
              mode={mode}
            />
          );
      }
    };

    return (
      <div className={wrapperClassName} onMouseDown={handleClick} onClick={(e) => e.stopPropagation()}>
        {renderInput()}
      </div>
    );
  }
);

ValueInput.displayName = "ValueInput";

export default ValueInput;
