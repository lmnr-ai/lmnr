import { ImagePart, TextPart } from "ai";
import { capitalize } from "lodash";
import { CircleMinus, CirclePlus, ImagePlus, MessageCirclePlus } from "lucide-react";
import { Controller, ControllerRenderProps, useFieldArray, UseFieldArrayReturn, useFormContext } from "react-hook-form";

import MessageParts from "@/components/playground/messages/message-parts";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PlaygroundForm } from "@/lib/playground/types";

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
    <div className="px-2 py-3 rounded-md border-[1px] bg-muted/50 group overflow-hidden">
      <div className="flex items-center gap-1 mb-2">
        <Controller
          render={({ field: { value, onChange } }) => (
            <Select value={value} onValueChange={handleUpdateRole(onChange)}>
              <SelectTrigger className="w-fit border-none pl-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["user", "assistant", "system"].map((item) => (
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
        {watch(`messages.${index}.role`) !== "system" && (
          <>
            <Tooltip>
              <TooltipContent>Add text message part</TooltipContent>
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
              <TooltipContent>Add image message part</TooltipContent>
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
        <Tooltip>
          <TooltipContent>Add message</TooltipContent>
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
            <TooltipContent>Remove message</TooltipContent>
            <TooltipTrigger asChild>
              <Button onClick={() => remove(index)} className={buttonClassName} variant="outline" size="icon">
                <CircleMinus className="text-muted-foreground" size={12} />
              </Button>
            </TooltipTrigger>
          </Tooltip>
        )}
      </div>
      <MessageParts remove={contentRemove} fields={fields} parentIndex={index} />
    </div>
  );
};

export default Message;
