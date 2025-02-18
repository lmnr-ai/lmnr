import { CoreMessage, ImagePart, TextPart } from "ai";
import { Image as IconImage, X } from "lucide-react";
import Image from "next/image";
import { Controller, FieldArrayWithId, UseFieldArrayRemove, useFormContext } from "react-hook-form";

import { Button } from "@/components/ui/button";
import DefaultTextarea from "@/components/ui/default-textarea";
import { IconMessage } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Provider } from "@/lib/pipeline/types";
import { PlaygroundForm } from "@/lib/playground/types";

const buttonClassName = "size-fit p-[1px] transition-all duration-200 opacity-0 group-hover:opacity-100";

const ContentPart = ({
  parentIndex,
  fields,
  remove,
}: {
  parentIndex: number;
  fields: MessagePartsProps["fields"];
  remove: MessagePartsProps["remove"];
}) => {
  const { register } = useFormContext<{
    model: `${Provider}:${string}`;
    messages: { role: CoreMessage["role"]; content: (TextPart | ImagePart)[] }[];
  }>();

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
                <Input
                  placeholder="Enter text message"
                  {...register(`messages.${parentIndex}.content.${index}.text` as const)}
                  className="border-none p-0 focus-visible:ring-0 h-fit rounded-none"
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
                  <Image className="self-start object-cover" width={24} height={24} alt="img" src={part.image} />
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

interface MessagePartsProps {
  index: number;
  fields: FieldArrayWithId<
    {
      model: `${Provider}:${string}`;
      messages: { role: "system" | "role" | "user"; content: (TextPart | ImagePart)[] }[];
    },
    `messages.${number}.content`
  >[];
  remove: UseFieldArrayRemove;
}

const MessageParts = ({ index, fields, remove }: MessagePartsProps) => {
  const { control, getValues } = useFormContext<PlaygroundForm>();
  if (typeof getValues(`messages.${index}.content`) === "string") {
    return (
      <Controller
        render={({ field: { value, onChange } }) => {
          if (typeof value === "string") {
            return (
              <div className="flex gap-2">
                <span className="pt-1">
                  <IconMessage className="size-3" />
                </span>
                <Input
                  placeholder="Enter text message"
                  onChange={onChange}
                  value={value}
                  className="border-none p-0 focus-visible:ring-0 h-fit rounded-none"
                />
              </div>
            );
          }
          return <></>;
        }}
        name={`messages.${index}.content`}
        control={control}
      />
    );
  }

  return <ContentPart remove={remove} fields={fields} parentIndex={index} />;
};

export default MessageParts;
