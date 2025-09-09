import { TooltipPortal } from "@radix-ui/react-tooltip";
import { capitalize } from "lodash";
import { Bolt, ChevronRight, CircleMinus, CirclePlus, ImagePlus, MessageCirclePlus } from "lucide-react";
import React from "react";
import { Controller, ControllerRenderProps, useFieldArray, UseFieldArrayReturn, useFormContext } from "react-hook-form";

import MessageParts from "@/components/playground/messages/message-parts";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ImagePart, PlaygroundForm, TextPart, ToolCallPart, ToolResultPart } from "@/lib/playground/types";

interface MessageProps {
  insert: UseFieldArrayReturn<PlaygroundForm, "messages">["insert"];
  remove: UseFieldArrayReturn<PlaygroundForm, "messages">["remove"];
  update: UseFieldArrayReturn<PlaygroundForm, "messages">["update"];
  index: number;
  deletable?: boolean;
}

const defaultMessage: PlaygroundForm["messages"]["0"] = {
  role: "user",
  content: [
    {
      type: "text",
      text: "",
    },
  ],
};

const defaultTextPart: TextPart = {
  text: "",
  type: "text",
};

const defaultImagePart: ImagePart = {
  type: "image",
  image: "",
};

const defaultToolCallPart: ToolCallPart = {
  type: "tool-call",
  toolName: "",
  toolCallId: "",
  input: {},
};

const defaultToolResultPart: ToolResultPart = {
  type: "tool-result",
  toolCallId: "",
  toolName: "",
  output: { type: "text", value: "" },
};

const buttonClassName =
  "size-fit p-[5px] bg-muted/50 transition-opacity duration-200 opacity-0 group-hover:opacity-100";
const Message = ({ insert, remove, update, index, deletable = true }: MessageProps) => {
  const { control, watch } = useFormContext<PlaygroundForm>();

  const {
    fields,
    append,
    remove: contentRemove,
  } = useFieldArray({
    name: `messages.${index}.content`,
    control,
  });

  const handleUpdateRole =
    (onChange: ControllerRenderProps["onChange"]) => (value: PlaygroundForm["messages"]["0"]["role"]) => {
      if (value === "system") {
        update(index, { content: [{ type: "text", text: "" }], role: value });
      } else {
        onChange(value);
      }
    };

  return (
    <Collapsible defaultOpen className="px-2 py-3 rounded-md border-[1px] bg-muted/50 group">
      <div className="flex items-center gap-1 group-data-[state=open]:mb-2">
        <Controller
          render={({ field: { value, onChange } }) => (
            <Select value={value} onValueChange={handleUpdateRole(onChange)}>
              <SelectTrigger className="w-fit border-none pl-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["user", "assistant", "system", "tool"].map((item) => (
                  <SelectItem key={item} value={item}>
                    {capitalize(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          name={`messages.${index}.role`}
          control={control}
        />
        {watch(`messages.${index}.role`) !== "system" && watch(`messages.${index}.role`) !== "tool" && (
          <>
            <Tooltip>
              <TooltipPortal>
                <TooltipContent>Add text message part</TooltipContent>
              </TooltipPortal>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => append(defaultTextPart)}
                  className={buttonClassName}
                  variant="outline"
                  size="icon"
                >
                  <MessageCirclePlus size={12} />
                </Button>
              </TooltipTrigger>
            </Tooltip>
            <Tooltip>
              <TooltipPortal>
                <TooltipContent>Add image message part</TooltipContent>
              </TooltipPortal>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => append(defaultImagePart)}
                  className={buttonClassName}
                  variant="outline"
                  size="icon"
                >
                  <ImagePlus size={12} />
                </Button>
              </TooltipTrigger>
            </Tooltip>
          </>
        )}
        {watch(`messages.${index}.role`) === "tool" && (
          <Tooltip>
            <TooltipPortal>
              <TooltipContent>Add tool result part</TooltipContent>
            </TooltipPortal>
            <TooltipTrigger asChild>
              <Button
                onClick={() => append(defaultToolResultPart)}
                className={buttonClassName}
                variant="outline"
                size="icon"
              >
                <Bolt size={12} />
              </Button>
            </TooltipTrigger>
          </Tooltip>
        )}
        {watch(`messages.${index}.role`) === "assistant" && (
          <Tooltip>
            <TooltipPortal>
              <TooltipContent>Add tool call part</TooltipContent>
            </TooltipPortal>
            <TooltipTrigger asChild>
              <Button
                onClick={() => append(defaultToolCallPart)}
                className={buttonClassName}
                variant="outline"
                size="icon"
              >
                <Bolt size={12} />
              </Button>
            </TooltipTrigger>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipPortal>
            <TooltipContent>Add message</TooltipContent>
          </TooltipPortal>
          <TooltipTrigger asChild>
            <Button
              onClick={() => insert(index + 1, defaultMessage)}
              className={buttonClassName}
              variant="outline"
              size="icon"
            >
              <CirclePlus className="text-muted-foreground" size={12} />
            </Button>
          </TooltipTrigger>
        </Tooltip>
        {deletable && (
          <Tooltip>
            <TooltipPortal>
              <TooltipContent>Remove message</TooltipContent>
            </TooltipPortal>
            <TooltipTrigger asChild>
              <Button onClick={() => remove(index)} className={buttonClassName} variant="outline" size="icon">
                <CircleMinus className="text-muted-foreground" size={12} />
              </Button>
            </TooltipTrigger>
          </Tooltip>
        )}
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="icon" className="w-6 h-6 ml-auto">
            <ChevronRight className="w-4 h-4 text-muted-foreground mr-2 group-data-[state=open]:rotate-90 transition-transform duration-200" />
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <MessageParts remove={contentRemove} fields={fields} parentIndex={index} />
      </CollapsibleContent>
    </Collapsible>
  );
};

export default Message;
