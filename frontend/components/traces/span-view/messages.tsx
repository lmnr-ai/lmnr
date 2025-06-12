import { useVirtualizer } from "@tanstack/react-virtual";
import { isEqual } from "lodash";
import { ChevronDown } from "lucide-react";
import { memo, useRef } from "react";

import ContentParts from "@/components/traces/span-view/content-parts";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatMessage, ChatMessageContentPart } from "@/lib/types";

interface ChatMessageListTabProps {
  messages: { role?: ChatMessage["role"]; content: ChatMessageContentPart[] }[];
  presetKey?: string | null;
}

function PureMessages({ messages, presetKey }: ChatMessageListTabProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 500,
    overscan: 16,
    gap: 16,
  });

  const items = virtualizer.getVirtualItems();

  return (
    <ScrollArea
      ref={parentRef}
      className="h-full relative overflow-y-auto"
      style={{
        width: "100%",
        contain: "strict",
      }}
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
            transform: `translateY(${items[0]?.start ?? 0}px)`,
          }}
          className="p-4 absolute top-0 left-0 w-full"
        >
          {items.map((virtualRow) => {
            const message = messages[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                className="flex flex-col border rounded mb-4"
              >
                {message?.role && (
                  <div className="font-medium text-sm text-secondary-foreground p-2 border-b">
                    {message.role.toUpperCase()}
                  </div>
                )}
                <ContentParts presetKey={presetKey} contentParts={message.content} />
              </div>
            );
          })}
        </div>
      </div>
      <Button
        variant="outline"
        size="icon"
        className="absolute bottom-3 right-3 rounded-full"
        onClick={() => virtualizer.scrollToIndex(messages.length - 1, { align: "end" })}
      >
        <ChevronDown className="w-4 h-4" />
      </Button>
    </ScrollArea>
  );
}

const Messages = memo(PureMessages, (prevProps, nextProps) => {
  if (prevProps.messages.length !== nextProps.messages.length) return false;
  return isEqual(prevProps.messages, nextProps.messages);
});

export default Messages;
