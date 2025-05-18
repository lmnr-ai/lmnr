import { TooltipPortal } from "@radix-ui/react-tooltip";
import { Bolt, X } from "lucide-react";
import { useCallback, useMemo } from "react";
import { Controller, ControllerRenderProps, useFormContext } from "react-hook-form";

import { Button } from "@/components/ui/button";
import CodeHighlighter from "@/components/ui/code-highlighter/index";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PlaygroundForm } from "@/lib/playground/types";
import { cn, pluralize } from "@/lib/utils";

const toolChoices = ["None", "Auto", "Required", "Function name"];
const exampleTools = {
  weather: {
    description: "User profile information",
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "The location to get the weather for",
        },
      },
      required: ["location"],
    },
  },
};

export default function ToolsDialog({ className }: { className?: string }) {
  const {
    control,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<PlaygroundForm>();

  const tools = watch("tools");
  const model = watch("model");

  const handleToolChoiceChange = useCallback(
    (onChange: ControllerRenderProps["onChange"]) => (value: string) => {
      if (value !== "Function name") {
        onChange(value);
      } else {
        onChange({
          type: "tool",
          toolName: "",
        });
      }
    },
    []
  );

  const toolsCount = useMemo(() => {
    try {
      return Object.keys(JSON.parse(tools ?? "") || {})?.length || 0;
    } catch (e) {
      return 0;
    }
  }, [tools]);

  const renderTrigger = useCallback(() => {
    if (toolsCount === 0) {
      return (
        <DialogTrigger asChild>
          <Button
            disabled={!model}
            variant="outline"
            size="icon"
            className={cn("focus-visible:ring-0 w-8 h-8 p-2", className)}
          >
            <Bolt className="w-4 h-4" />
          </Button>
        </DialogTrigger>
      );
    }

    return (
      <div className="flex flex-row [&>*:first-child]:border-r-0 [&>*:first-child]:rounded-l [&>*:first-child]:rounded-r-none [&>*:last-child]:rounded-r [&>*:last-child]:rounded-l-none">
        <DialogTrigger asChild>
          <Button
            disabled={!model}
            variant="outline"
            size="icon"
            className={cn("focus-visible:ring-0 h-8 w-fit p-2", className)}
          >
            <Bolt className="w-4 h-4" />
            <span className="ml-2">
              {toolsCount} {pluralize(toolsCount, "tool", "tools")}
            </span>
          </Button>
        </DialogTrigger>
        <Button onClick={() => setValue("tools", "")} className="w-8 h-8" variant="outline" size="icon">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }, [className, model, setValue, toolsCount]);

  return (
    <Dialog>
      <Tooltip>
        <TooltipTrigger asChild>{renderTrigger()}</TooltipTrigger>
        <TooltipPortal>
          <TooltipContent>Tools</TooltipContent>
        </TooltipPortal>
      </Tooltip>
      <DialogContent className="flex flex-col gap-4 max-w-lg w-full p-4 h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Tools</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 flex-1 min-h-0">
          {" "}
          <div className="flex flex-col gap-2 flex-1 min-h-0">
            <div className="flex items-center gap-2 justify-between">
              <span className="text-sm">Tools definition</span>
              <Button
                onClick={() => setValue("tools", JSON.stringify(exampleTools))}
                className="text-primary text-sm p-0"
                variant="ghost"
              >
                <span className="text-sm">Insert example</span>
              </Button>
            </div>
            <div className="flex-1 min-h-0 p-1">
              <Controller
                render={({ field: { onChange } }) => (
                  <CodeHighlighter
                    onChange={(v) => onChange(v)}
                    codeEditorClassName="rounded-b h-full"
                    className={cn("rounded h-full", {
                      "border border-destructive/75": errors.tools?.message,
                    })}
                    defaultMode="json"
                    modes={["JSON"]}
                    value={tools ?? ""}
                  />
                )}
                name="tools"
                control={control}
                rules={{
                  validate: (value) => {
                    try {
                      if (!value) return true;
                      const parsed = JSON.parse(value);

                      if (typeof parsed !== "object") return "Tools must be an object";

                      for (const [toolName, tool] of Object.entries(parsed)) {
                        if (typeof tool !== "object" || !tool) {
                          return `Tool "${toolName}" must be an object`;
                        }
                        if (!("parameters" in tool)) {
                          return `Tool "${toolName}" is missing parameters`;
                        }
                      }
                      return true;
                    } catch (e) {
                      return e instanceof Error ? e.message : "Invalid JSON";
                    }
                  },
                }}
              />
            </div>
            <span className="text-xs text-secondary-foreground">
              Tools are defined as an object where each <b>key</b> is the tool name.
              <br />
              Each tool has:
              <ul className="m-auto pl-4 list-disc">
                <li>
                  <b>description</b>: A string explaining what the tool does
                </li>
                <li>
                  <b>parameters</b>: A JSON schema defining the input parameters
                </li>
              </ul>
            </span>
          </div>
          <div className="flex w-full flex-col gap-2">
            <span className="text-sm">Tool Choice</span>
            <div className="flex items-center gap-2 justify-between">
              <Controller
                render={({ field: { onChange } }) => (
                  <Select
                    value={typeof watch("toolChoice") === "object" ? "function name" : (watch("toolChoice") as string)}
                    onValueChange={handleToolChoiceChange(onChange)}
                  >
                    <SelectTrigger className="w-fit">
                      <SelectValue placeholder="Select a tool choice" />
                    </SelectTrigger>
                    <SelectContent>
                      {toolChoices.map((item) => (
                        <SelectItem key={item} value={item.toLowerCase()}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                name="toolChoice"
                control={control}
              />
              {typeof watch("toolChoice") === "object" && (
                <Controller
                  control={control}
                  render={({ field: { value, onChange } }) => (
                    <Input className="h-7" defaultValue={value} onBlur={onChange} />
                  )}
                  name="toolChoice.toolName"
                />
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
