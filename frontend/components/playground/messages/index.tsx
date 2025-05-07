import { useVirtualizer } from "@tanstack/react-virtual";
import { Plus } from "lucide-react";
import { useRef } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

import Message from "@/components/playground/messages/message";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PlaygroundForm } from "@/lib/playground/types";

const defaultMessage: PlaygroundForm["messages"]["0"] = {
  role: "user",
  content: [
    {
      type: "text",
      text: "",
    },
  ],
};

const Messages = () => {
  const { control } = useFormContext<PlaygroundForm>();
  const ref = useRef<HTMLDivElement>(null);

  const { fields, remove, insert, update, append } = useFieldArray({
    control,
    name: "messages",
  });

  const virtualizer = useVirtualizer({
    count: fields.length,
    getScrollElement: () => ref.current,
    estimateSize: () => 100,
    overscan: 10,
  });

  const items = virtualizer.getVirtualItems();

  return (
    <>
      <ScrollArea
        className="overflow-y-auto flex-grow px-4 [mask-image:linear-gradient(to_top,rgba(0,0,0,0)_0%,_rgba(0,0,0,1)_3%)]"
        style={{
          contain: "strict",
        }}
        ref={ref}
      >
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: "100%",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${items[0]?.start ?? 0}px)`,
            }}
          >
            {items.map((virtualRow) => {
              const message = fields[virtualRow.index];
              return (
                <div
                  className="h-full mb-2"
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                >
                  <Message
                    update={update}
                    deletable={fields.length > 1}
                    key={message.id}
                    index={virtualRow.index}
                    insert={insert}
                    remove={remove}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </ScrollArea>
      <div className="mt-2 px-4">
        <Button onClick={() => append(defaultMessage)} variant="outline" className="self-start h-8">
          <Plus className="mr-2" size={12} />
          Add message
        </Button>
      </div>
    </>
  );
};

export default Messages;
