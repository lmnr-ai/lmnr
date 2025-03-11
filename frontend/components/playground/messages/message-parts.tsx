import { Image as IconImage, X } from "lucide-react";
import { Controller, FieldArrayWithId, UseFieldArrayRemove, useFormContext } from "react-hook-form";

import ImageWithPreview from "@/components/playground/image-with-preview";
import { Button } from "@/components/ui/button";
import DefaultTextarea from "@/components/ui/default-textarea";
import { IconMessage } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { PlaygroundForm } from "@/lib/playground/types";

const buttonClassName = "size-fit p-[1px] transition-all duration-200 opacity-0 group-hover:opacity-100";

interface MessagePartsProps {
  parentIndex: number;
  fields: FieldArrayWithId<PlaygroundForm, `messages.${number}.content`>[];
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

          default:
            return (
              <Controller
                key={part.id}
                render={({ field: { value, onChange } }) => (
                  <div>
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
                      <ImageWithPreview src={value} className="object-cover rounded-sm w-12 h-12" alt="img" />
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
