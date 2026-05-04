"use client";

import { Info } from "lucide-react";
import { type ReactNode } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import SchemaFieldRow from "./schema-field-row";
import { type ManageSignalForm } from "./types";

export default function SchemaFieldsBuilder({ headerAction }: { headerAction?: ReactNode }) {
  const { control } = useFormContext<ManageSignalForm>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "schemaFields",
  });

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <TooltipProvider delayDuration={200}>
          <div className="flex items-center gap-1.5">
            <Label className="text-sm font-medium">Output Schema</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-60">
                <p>Define what gets extracted from each trace.</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
        <div className="flex items-center gap-2">
          {headerAction}
          <Button
            type="button"
            icon="plus"
            variant="outline"
            onClick={() => append({ name: "", description: "", type: "string" })}
          >
            Add Field
          </Button>
        </div>
      </div>
      <div className="space-y-2 border rounded-md p-3 bg-muted/30">
        <div className="flex gap-2 text-xs text-muted-foreground font-medium mb-1">
          <span className="w-32">Name</span>
          <span className="w-28">Type</span>
          <span className="flex-1">Description</span>
          <span className="w-9" />
        </div>
        {fields.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md">
            No fields defined. Click &quot;Add Field&quot; to add one.
          </div>
        )}
        {fields.map((field, index) => (
          <SchemaFieldRow key={field.id} index={index} onRemove={() => remove(index)} canRemove={fields.length > 1} />
        ))}
      </div>
    </div>
  );
}
