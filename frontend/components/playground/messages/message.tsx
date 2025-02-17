import { ImagePart, TextPart } from "ai";
import { capitalize } from "lodash";
import { CircleMinus, CirclePlus, ImagePlus, MessageCirclePlus } from "lucide-react";
import { Controller, useFieldArray, UseFieldArrayReturn, useFormContext } from "react-hook-form";

import MessageParts from "@/components/playground/messages/message-parts";
import { PlaygroundForm } from "@/components/playground/playground";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Provider } from "@/lib/pipeline/types";

interface MessageProps {
  insert: UseFieldArrayReturn<PlaygroundForm, "messages">["insert"];
  remove: UseFieldArrayReturn<PlaygroundForm, "messages">["remove"];
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

const Message = ({ insert, remove, index, deletable = true }: MessageProps) => {
  const { control } = useFormContext<{
    model: `${Provider}:${string}`;
    messages: { role: "system" | "role" | "user"; content: (TextPart | ImagePart)[] }[];
  }>();

  const {
    fields,
    append,
    remove: contentRemove,
  } = useFieldArray({
    name: `messages.${index}.content`,
    control,
  });

  return (
    <div className="px-2 py-3 rounded-sm border-[1px] bg-muted/50">
      <div className="flex items-center gap-1">
        <Controller
          render={({ field: { value, onChange } }) => (
            <Select value={value} onValueChange={onChange}>
              <SelectTrigger className="w-fit border-none mb-2 pl-1 mr-auto">
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
        <Button onClick={() => append(defaultTextPart)} className="size-fit" variant="ghost" size="icon">
          <MessageCirclePlus size={16} />
        </Button>
        <Button onClick={() => append(defaultImagePart)} className="size-fit" variant="ghost" size="icon">
          <ImagePlus size={16} />
        </Button>
        <Button onClick={() => insert(index + 1, defaultMessage)} className="size-fit" variant="ghost" size="icon">
          <CirclePlus size={16} />
        </Button>
        {deletable && (
          <Button onClick={() => remove(index)} className="size-fit" variant="ghost" size="icon">
            <CircleMinus size={16} />
          </Button>
        )}
      </div>
      <MessageParts remove={contentRemove} fields={fields} index={index} />
    </div>
  );
};

export default Message;
