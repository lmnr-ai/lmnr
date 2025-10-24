"use client";

import { KeyboardEvent, useEffect, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

import { Badge } from "../ui/badge";
import { useQueueStore } from "./queue-store";

interface AnnotationInterfaceProps {
  className?: string;
}

function isNumberOptions(options: any): options is { min?: number; max?: number } {
  return options && typeof options === "object" && !Array.isArray(options);
}

interface FieldOption {
  value: any;
  label: string;
  keyNumber: number;
}

const getFieldOptions = (field: any): FieldOption[] => {
  if (field.type === "number" && isNumberOptions(field.options)) {
    const options = field.options as { min?: number; max?: number };
    return Array.from({ length: (options.max || 5) - (options.min || 1) + 1 }, (_, i) => {
      const value = (options.min || 1) + i;
      return {
        value,
        label: String(value),
        keyNumber: i + 1,
      };
    });
  }

  if (field.type === "enum" && Array.isArray(field.options)) {
    return field.options.map((option: string, index: number) => ({
      value: option,
      label: option,
      keyNumber: index + 1,
    }));
  }

  if (field.type === "boolean") {
    return [
      { value: false, label: "no", keyNumber: 1 },
      { value: true, label: "yes", keyNumber: 2 },
    ];
  }

  return [];
};

const OptionButton = ({
  option,
  isSelected,
  onClick,
}: {
  option: FieldOption;
  isSelected: boolean;
  onClick: () => void;
}) => (
  <Button variant={isSelected ? "default" : "outline"} size="sm" className="h-8 px-3 text-xs" onClick={onClick}>
    <div className="flex items-center gap-2">
      <span>{option.label}</span>
      <span className="text-xs opacity-60 bg-muted px-1 rounded">{option.keyNumber}</span>
    </div>
  </Button>
);

const FieldOptions = ({
  field,
  target,
  updateTargetField,
  isFieldFocused,
  onNavigate,
}: {
  field: any;
  target: Record<string, unknown>;
  updateTargetField: (key: string, value: unknown) => void;
  isFieldFocused: boolean;
  onNavigate: (direction: "next" | "prev") => void;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const sliderRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (field.type === "string" && inputRef.current) {
      if (isFieldFocused) {
        inputRef.current.focus();
      } else {
        inputRef.current.blur();
      }
    } else if (field.type === "number" && sliderRef.current) {
      if (isFieldFocused) {
        sliderRef.current.focus();
      } else {
        sliderRef.current.blur();
      }
    }
  }, [isFieldFocused, field.type, field.key]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        onNavigate("prev");
      } else {
        onNavigate("next");
      }
    }
  };

  if (field.type === "string") {
    return (
      <Input
        ref={inputRef}
        type="text"
        placeholder="Input text..."
        value={(target[field.key] as string) || ""}
        onChange={(e) => updateTargetField(field.key, e.target.value)}
        onKeyDown={handleKeyDown}
        className="text-sm"
      />
    );
  }

  if (field.type === "number" && isNumberOptions(field.options)) {
    const options = field.options as { min?: number; max?: number };
    const min = options.min || 1;
    const max = options.max || 5;
    const currentValue = (target[field.key] as number) || min;

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Value:</span>
          <span className="font-medium">{currentValue}</span>
        </div>
        <Slider
          ref={sliderRef}
          value={[currentValue]}
          onValueChange={(values) => updateTargetField(field.key, values[0])}
          min={min}
          max={max}
          step={1}
          className="w-full"
          tabIndex={isFieldFocused ? 0 : -1}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{min}</span>
          <span>{max}</span>
        </div>
      </div>
    );
  }

  const options = getFieldOptions(field);
  if (options.length === 0) return null;

  return (
    <div className={cn("flex gap-1", field.type === "enum" ? "flex-wrap" : "")}>
      {options.map((option) => (
        <OptionButton
          key={`${field.key}-${option.value}`}
          option={option}
          isSelected={target[field.key] === option.value}
          onClick={() => updateTargetField(field.key, option.value)}
        />
      ))}
    </div>
  );
};

export default function AnnotationInterface({ className }: AnnotationInterfaceProps) {
  const { fields, focusedFieldIndex, target, updateTargetField, focusField, selectOptionInFocusedField } =
    useQueueStore((state) => ({
      fields: state.fields,
      focusedFieldIndex: state.focusedFieldIndex,
      target: state.getTarget(),
      updateTargetField: state.updateTargetField,
      focusField: state.focusField,
      selectOptionInFocusedField: state.selectOptionInFocusedField,
    }));

  useHotkeys("tab", (event: KeyboardEvent) => {
    if (fields.length === 0) return;
    event.preventDefault();
    focusField("next");
  });

  useHotkeys("shift+tab", (event: KeyboardEvent) => {
    if (fields.length === 0) return;
    event.preventDefault();
    focusField("prev");
  });

  useHotkeys("a", (event: KeyboardEvent) => {
    if (fields.length === 0) return;
    event.preventDefault();
    focusField("first");
  });

  useHotkeys("1,2,3,4,5,6,7,8,9", (event: KeyboardEvent) => {
    if (fields.length === 0) return;
    const focusedField = fields[focusedFieldIndex];
    if (focusedField?.type === "string") return;

    const num = parseInt(event.key);
    if (num >= 1 && num <= 9) {
      event.preventDefault();
      selectOptionInFocusedField(num);
    }
  });

  useHotkeys("left,right", (event: KeyboardEvent) => {
    if (fields.length === 0) return;
    const focusedField = fields[focusedFieldIndex];
    if (focusedField?.type !== "number" || !isNumberOptions(focusedField.options)) return;

    event.preventDefault();
    const options = focusedField.options as { min?: number; max?: number };
    const min = options.min || 1;
    const max = options.max || 5;
    const currentValue = (target[focusedField.key] as number) || min;

    if (event.key === "left" && currentValue > min) {
      updateTargetField(focusedField.key, currentValue - 1);
    } else if (event.key === "right" && currentValue < max) {
      updateTargetField(focusedField.key, currentValue + 1);
    }
  });

  if (fields.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-3", className)}>
      {fields.map((field, index) => (
        <div
          key={field.key}
          className={cn(
            "space-y-2 p-3 rounded-lg border transition-colors",
            focusedFieldIndex === index ? "border-primary bg-primary/5" : "border-muted"
          )}
        >
          <div className="flex items-center justify-between">
            <div className="text-sm flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-mono bg-muted/50 font-medium">
                {field.key}
              </Badge>
              <span className="font-base text-secondary-foreground">{field.description || field.key}</span>
            </div>
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{index + 1}</span>
          </div>

          <FieldOptions
            field={field}
            target={target}
            updateTargetField={updateTargetField}
            isFieldFocused={focusedFieldIndex === index}
            onNavigate={focusField}
          />
        </div>
      ))}

      <div className="text-xs text-muted-foreground pt-2">
        {fields.length > 0 && (
          <div>
            <div className="mb-1">
              <strong>Navigation:</strong> <kbd className="bg-muted/50 px-1.5 py-0.5 rounded text-white/70">Tab</kbd> to
              navigate between dimensions,{" "}
              <kbd className="bg-muted/50 px-1.5 py-0.5 rounded text-white/70">Shift+Tab</kbd> to go backwards,{" "}
              <kbd className="bg-muted/50 px-1.5 py-0.5 rounded text-white/70">a</kbd> to focus on the first dimension
            </div>
            <div className="mb-1">
              <strong>Keys 1-9:</strong> Select options within the focused dimension
            </div>
            <div>
              <strong>Arrow keys:</strong> Adjust slider values
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
