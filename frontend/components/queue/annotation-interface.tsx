"use client";

import { useHotkeys } from "react-hotkeys-hook";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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
}: {
  field: any;
  target: Record<string, unknown>;
  updateTargetField: (key: string, value: unknown) => void;
}) => {
  // Handle string input fields
  if (field.type === "string") {
    return (
      <Input
        type="text"
        placeholder={`Enter ${field.description || field.key}...`}
        value={(target[field.key] as string) || ""}
        onChange={(e) => updateTargetField(field.key, e.target.value)}
        className="text-sm"
      />
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

  useHotkeys("tab", (event) => {
    if (fields.length === 0) return;
    event.preventDefault();
    focusField("next");
  });

  useHotkeys("shift+tab", (event) => {
    if (fields.length === 0) return;
    event.preventDefault();
    focusField("prev");
  });

  useHotkeys("a", (event) => {
    if (fields.length === 0) return;
    event.preventDefault();
    focusField("first");
  });

  useHotkeys("1,2,3,4,5,6,7,8,9", (event) => {
    if (fields.length === 0) return;
    const focusedField = fields[focusedFieldIndex];
    // Don't handle number keys for string fields (let user type normally)
    if (focusedField?.type === "string") return;

    const num = parseInt(event.key);
    if (num >= 1 && num <= 9) {
      event.preventDefault();
      selectOptionInFocusedField(num);
    }
  });

  if (fields.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="text-sm font-medium">Annotation Interface</div>

      {fields.map((field, index) => (
        <div
          key={field.key}
          className={cn(
            "space-y-2 p-3 rounded-lg border transition-colors",
            focusedFieldIndex === index ? "border-primary bg-primary/5" : "border-transparent"
          )}
        >
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="font-medium">{field.description || field.key}</span>
              <span className="text-xs text-muted-foreground ml-2">({field.key})</span>
            </div>
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{index + 1}</span>
          </div>

          <FieldOptions field={field} target={target} updateTargetField={updateTargetField} />
        </div>
      ))}

      <div className="text-xs text-muted-foreground pt-2 border-t">
        {fields.length > 0 && (
          <div>
            <div className="mb-1">
              <strong>Navigation:</strong> Tab to navigate between dimensions, Shift+Tab to go backwards, &#39;a&#39; to
              focus first dimension
            </div>
            <div className="mb-1">
              <strong>Current focus:</strong> {fields[focusedFieldIndex]?.description || fields[focusedFieldIndex]?.key}
            </div>
            <div>
              <strong>Keys 1-9:</strong> Select options within the focused dimension (not for string fields)
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
