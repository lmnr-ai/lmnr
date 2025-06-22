import { Bolt, Image as IconImage, Paperclip, X } from "lucide-react";
import { ChangeEvent, useCallback, useRef } from "react";
import { Controller, FieldArrayWithId, UseFieldArrayRemove, useFormContext } from "react-hook-form";

import ImageWithPreview from "@/components/playground/image-with-preview";
import { Button } from "@/components/ui/button";
import CodeHighlighter from "@/components/ui/code-highlighter/index";
import DefaultTextarea from "@/components/ui/default-textarea";
import { IconMessage } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { useToast } from "@/lib/hooks/use-toast";
import { PlaygroundForm } from "@/lib/playground/types";
import { cn } from "@/lib/utils";

const buttonClassName = "size-fit p-[1px] transition-all duration-200 opacity-0 group-hover:opacity-100";

interface MessagePartsProps {
  parentIndex: number;
  fields: FieldArrayWithId<PlaygroundForm, `messages.${number}.content`>[];
  remove: UseFieldArrayRemove;
}

const MAX_FILE_SIZE = 2.5 * 1024 * 1024; // 2.5MB in bytes

const MessageParts = ({ parentIndex, fields, remove }: MessagePartsProps) => {
  const { register, control } = useFormContext<PlaygroundForm>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const handleFileSelect = useCallback(
    (onChange: (value: string) => void) => async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        if (file.size > MAX_FILE_SIZE) {
          toast({ title: "File is too big.", description: "File size must be less than 2.5MB" });
          return;
        }

        try {
          const reader = new FileReader();
          reader.onload = (e) => {
            const result = e.target?.result;
            if (typeof result === "string") {
              onChange(result);
            }
          };
          reader.readAsDataURL(file);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to upload image.";
          toast({ variant: "destructive", title: "Error", description: message });
        }
      }
    },
    [toast]
  );

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
                  className="border-none bg-transparent p-0 focus-visible:ring-0 flex-1 h-fit rounded-none max-h-96"
                />
                {fields.length > 1 && (
                  <Button onClick={() => remove(index)} className={buttonClassName} variant="outline" size="icon">
                    <X className="text-gray-400" size={12} />
                  </Button>
                )}
              </div>
            );

          case "tool-call":
            return (
              <div key={part.id} className="flex gap-2">
                <span className="pt-1">
                  <Bolt className="size-3" />
                </span>
                <div className="flex flex-1 flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-secondary-foreground text-xs">Tool name</span>
                    <Input
                      placeholder="Enter tool name"
                      {...register(`messages.${parentIndex}.content.${index}.toolName` as const)}
                      className="bg-transparent focus-visible:ring-0 flex-1 h-fit max-h-96"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-secondary-foreground text-xs">Tool ID</span>
                    <Input
                      placeholder="Enter text message"
                      {...register(`messages.${parentIndex}.content.${index}.toolCallId` as const)}
                      className="bg-transparent focus-visible:ring-0 flex-1 h-fit max-h-96"
                    />
                  </div>
                  <Controller
                    render={({ field: { value, onChange } }) => (
                      <div className="flex flex-col gap-1">
                        <span className="text-secondary-foreground text-xs">Arguments</span>
                        <CodeHighlighter
                          showSettingsOnHover={false}
                          value={String(value)}
                          onChange={onChange}
                          className="bg-transparent p-0 focus-visible:ring-0 flex-1 h-fit max-h-96"
                        />
                      </div>
                    )}
                    name={`messages.${parentIndex}.content.${index}.args` as const}
                    control={control}
                  />
                </div>
                {fields.length > 1 && (
                  <Button onClick={() => remove(index)} className={buttonClassName} variant="outline" size="icon">
                    <X className="text-gray-400" size={12} />
                  </Button>
                )}
              </div>
            );

          case "tool-result":
            return (
              <div key={part.id} className="flex gap-2">
                <span className="pt-1">
                  <Bolt className="size-3" />
                </span>
                <div className="flex flex-1 flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-secondary-foreground text-xs">Tool name</span>
                    <Input
                      placeholder="Enter tool name"
                      {...register(`messages.${parentIndex}.content.${index}.toolName` as const)}
                      className="bg-transparent focus-visible:ring-0 flex-1 h-fit max-h-96"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-secondary-foreground text-xs">Tool ID</span>
                    <Input
                      placeholder="Enter text message"
                      {...register(`messages.${parentIndex}.content.${index}.toolCallId` as const)}
                      className="bg-transparent focus-visible:ring-0 flex-1 h-fit max-h-96"
                    />
                  </div>
                  <Controller
                    render={({ field: { value, onChange } }) => (
                      <div className="flex flex-col gap-1">
                        <span className="text-secondary-foreground text-xs">Result</span>
                        <CodeHighlighter
                          showSettingsOnHover={false}
                          value={value}
                          onChange={onChange}
                          className="bg-transparent p-0 focus-visible:ring-0 flex-1 h-fit max-h-96"
                        />
                      </div>
                    )}
                    name={`messages.${parentIndex}.content.${index}.result` as const}
                    control={control}
                  />
                </div>
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
                    <div className="flex items-center gap-2 mb-1">
                      <span>
                        <IconImage className="size-3" />
                      </span>
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/*"
                        onChange={handleFileSelect(onChange)}
                      />
                      <Button
                        onClick={() => fileInputRef.current?.click()}
                        size="icon"
                        variant="outline"
                        className={buttonClassName}
                      >
                        <Paperclip className="text-gray-400" size={12} />
                      </Button>
                      {fields.length > 1 && (
                        <Button
                          onClick={() => remove(index)}
                          className={cn(buttonClassName, "ml-auto")}
                          variant="outline"
                          size="icon"
                        >
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
