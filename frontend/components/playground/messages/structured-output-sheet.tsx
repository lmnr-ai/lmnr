import { TooltipPortal } from "@radix-ui/react-tooltip";
import { BracesIcon, X } from "lucide-react";
import { PropsWithChildren, useCallback } from "react";
import { Controller, useFormContext } from "react-hook-form";

import { Button } from "@/components/ui/button";
import CodeHighlighter from "@/components/ui/code-highlighter/index";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PlaygroundForm } from "@/lib/playground/types";
import { cn } from "@/lib/utils";

const exampleStructuredOutput = {
  type: "object",
  properties: {
    name: {
      type: "string",
      description: "The name of the person",
    },
    age: {
      type: "number",
      description: "The age of the person",
    },
  },
  required: ["name", "age"],
  additionalProperties: false,
};

export default function StructuredOutputSheet({
  children,
  className,
}: PropsWithChildren<{
  className?: string;
}>) {
  const {
    control,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<PlaygroundForm>();

  const structuredOutput = watch("structuredOutput");
  const model = watch("model");

  const renderTrigger = useCallback(() => {
    if (!structuredOutput) {
      return (
        <SheetTrigger asChild>
          <Button
            disabled={!model}
            variant="outline"
            size="icon"
            className={cn("focus-visible:ring-0 size-7", className)}
          >
            <BracesIcon className="size-3.5" />
          </Button>
        </SheetTrigger>
      );
    }

    return (
      <div className="flex flex-row [&>*:first-child]:border-r-0 [&>*:first-child]:rounded-l [&>*:first-child]:rounded-r-none [&>*:last-child]:rounded-r [&>*:last-child]:rounded-l-none">
        <SheetTrigger asChild>
          <Button
            disabled={!model}
            variant="outlinePrimary"
            size="icon"
            className={cn("focus-visible:ring-0 size-7", className)}
          >
            <BracesIcon className="size-4" />
          </Button>
        </SheetTrigger>
        <Button
          onClick={() => setValue("structuredOutput", undefined)}
          className="size-7"
          variant="outlinePrimary"
          size="icon"
        >
          <X className="size-4" />
        </Button>
      </div>
    );
  }, [className, model, setValue, structuredOutput]);

  return (
    <Sheet>
      <Tooltip>
        <TooltipTrigger asChild>{children || renderTrigger()}</TooltipTrigger>
        <TooltipPortal>
          <TooltipContent>Structured Output</TooltipContent>
        </TooltipPortal>
      </Tooltip>
      <SheetContent side="right" className="min-w-[50vw] w-full flex flex-col gap-4 p-4">
        <SheetHeader>
          <SheetTitle>Structured Output</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-2 flex-1 min-h-0">
          <div className="flex items-center gap-2 justify-between">
            <span className="text-sm">JSON Schema</span>
            <Button
              onClick={() => setValue("structuredOutput", JSON.stringify(exampleStructuredOutput, null, 2))}
              className="text-primary text-sm p-0"
              variant="ghost"
            >
              <span className="text-sm">Insert example</span>
            </Button>
          </div>
          <div className="p-1 flex flex-1 overflow-hidden">
            <Controller
              render={({ field: { onChange } }) => (
                <CodeHighlighter
                  onChange={(v) => onChange(v)}
                  codeEditorClassName="rounded-b"
                  className={cn("rounded h-full", {
                    "border border-destructive/75": errors.structuredOutput?.message,
                  })}
                  defaultMode="json"
                  modes={["JSON"]}
                  value={structuredOutput ?? ""}
                />
              )}
              name="structuredOutput"
              control={control}
              rules={{
                validate: (value) => {
                  try {
                    if (!value) {
                      return true;
                    }
                    JSON.parse(value);
                    return true;
                  } catch (e) {
                    return "Invalid JSON structure";
                  }
                },
              }}
            />
          </div>
          <span className="text-xs text-secondary-foreground">
            Define a JSON Schema to structure the model&apos;s output.
          </span>
        </div>
      </SheetContent>
    </Sheet>
  );
}
