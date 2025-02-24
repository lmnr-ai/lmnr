import { ImagePart, TextPart } from "ai";
import { Image as IconImage, X } from "lucide-react";
import { Controller, FieldArrayWithId, UseFieldArrayRemove, useFormContext } from "react-hook-form";

import { Button } from "@/components/ui/button";
import DefaultTextarea from "@/components/ui/default-textarea";
import { IconMessage } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
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
  const { register, control } = useFormContext<PlaygroundForm>();

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
              <Controller
                render={({ field: { value, onChange } }) => (
                  <div key={part.id}>
                    <div className="flex gap-2 mb-1">
                      <span className="pt-1">
                        <IconImage className="size-3" />
                      </span>
                      <Input
                        placeholder="Image URL, or base64 image"
                        value={value.toString()}
                        onChange={onChange}
                        className="border-none bg-transparent p-0 focus-visible:ring-0 flex-1 h-fit rounded-none"
                      />
                      {fields.length > 1 && (
                        <Button onClick={() => remove(index)} className={buttonClassName} variant="outline" size="icon">
                          <X className="text-gray-400" size={12} />
                        </Button>
                      )}
                    </div>
                    {typeof value === "string" && value && (
                      <img className="object-cover rounded-sm w-24" alt="img" src={value} />
                    )}
                  </div>
                )}
                name={`messages.${parentIndex}.content.${index}.image`}
                control={control}
              />
            );
        }
      })}
    </div>
  );
};

export default MessageParts;
