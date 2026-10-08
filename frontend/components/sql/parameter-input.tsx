"use client";

import { type SQLParameter } from "@/components/sql/parameters";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";

interface ParameterInputProps {
  parameter: SQLParameter;
  onChange: (name: string, value?: SQLParameter["value"]) => void;
}

/** One parameter's control. Every branch autofocuses, so a date doesn't cost a second click. */
const ParameterInput = ({ parameter, onChange }: ParameterInputProps) => {
  switch (parameter.type) {
    case "date":
      return (
        <Calendar
          mode="single"
          selected={parameter.value}
          onSelect={(date) => onChange(parameter.name, date)}
          initialFocus
          pagedNavigation
          className="p-0"
        />
      );

    case "number":
      return (
        <Input
          className="hide-arrow h-7"
          type="number"
          autoFocus
          placeholder={`Enter ${parameter.name}`}
          value={parameter.value ?? ""}
          // An empty field is "no value", not 0 — `Number("")` would silently bind zero and run.
          onChange={(e) => onChange(parameter.name, e.target.value === "" ? undefined : Number(e.target.value))}
        />
      );

    default:
      return (
        <Input
          className="h-7"
          type="text"
          autoFocus
          placeholder={`Enter ${parameter.name}`}
          value={parameter.value ?? ""}
          onChange={(e) => onChange(parameter.name, e.target.value)}
        />
      );
  }
};

export default ParameterInput;
