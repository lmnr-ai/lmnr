import { ImagePart, TextPart } from "ai";
import { Image as IconImage, X } from "lucide-react";
import { FieldArrayWithId, UseFieldArrayRemove, useFormContext } from "react-hook-form";

import { Button } from "@/components/ui/button";
import DefaultTextarea from "@/components/ui/default-textarea";
import { IconMessage } from "@/components/ui/icons";
import { Provider } from "@/lib/pipeline/types";
import { PlaygroundForm } from "@/lib/playground/types";

const buttonClassName = "size-fit p-[1px] transition-all duration-200 opacity-0 group-hover:opacity-100";

interface MessagePartsProps {
  parentIndex: number;
  fields: FieldArrayWithId<
    {
      model: `${Provider}:${string}`;
      messages: { role: "system" | "role" | "user"; content: (TextPart | ImagePart)[] }[];
    },
    `messages.${number}.content`
  >[];
  remove: UseFieldArrayRemove;
}

const MessageParts = ({ parentIndex, fields, remove }: MessagePartsProps) => {
  const { register } = useFormContext<PlaygroundForm>();

  return (
    <div className="flex-1 flex flex-col gap-2">
      {fields.map((part, index) => {
        switch (part.type) {
          case "text":
            return (
              <div key={part.id} className="flex gap-2">
                <span className="pt-1">
                  <IconMessage className="size-3" />
                </span>
                <DefaultTextarea
                  placeholder="Enter text message"
                  {...register(`messages.${parentIndex}.content.${index}.text` as const)}
                  className="border-none bg-transparent p-0 focus-visible:ring-0 flex-1 h-fit rounded-none"
                />
                {fields.length > 1 && (
                  <Button onClick={() => remove(index)} className={buttonClassName} variant="outline" size="icon">
                    <X className="text-gray-400" size={12} />
                  </Button>
                )}
              </div>
            );

          case "image":
            return (
              <div key={part.id} className="flex gap-2">
                <span className="pt-1">
                  <IconImage className="size-3" />
                </span>
                <DefaultTextarea
                  placeholder="Image URL, or base64 image"
                  {...register(`messages.${parentIndex}.content.${index}.image` as const)}
                  className="border-none bg-transparent p-0 focus-visible:ring-0 flex-1 h-fit rounded-none"
                />
                {typeof part.image === "string" && part.image && (
                  <img className="self-start object-cover" width={24} height={24} alt="img" src={part.image} />
                )}
                {fields.length > 1 && (
                  <Button onClick={() => remove(index)} className={buttonClassName} variant="outline" size="icon">
                    <X className="text-gray-400" size={12} />
                  </Button>
                )}
              </div>
            );
        }
      })}
    </div>
  );
};

export default MessageParts;
