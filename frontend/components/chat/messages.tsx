import { isEqual } from "lodash";
import { memo } from "react";

import Message from "@/components/chat/message";
import ThinkingMessage from "@/components/chat/thinking-message";
import { ChatMessage } from "@/components/chat/types";
import useScrollToBottom from "@/components/chat/use-scroll-to-bottom";

import { ScrollArea } from "../ui/scroll-area";

interface MessagesProps {
  messages: ChatMessage[];
  isLoading: boolean;
}

const PureMessages = ({ messages, isLoading }: MessagesProps) => {
  const [ref, messagesEndRef] = useScrollToBottom<HTMLDivElement>();

  return (
    <ScrollArea className="flex-1 pt-4">
      <div ref={ref} className="flex flex-col min-w-0">
        {messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}
        {isLoading && messages?.length > 0 && <ThinkingMessage />}

        <div ref={messagesEndRef} className="shrink-0 min-w-[24px] min-h-[24px]" />
      </div>
    </ScrollArea>
  );
};

const Messages = memo(PureMessages, (prevProps, nextProps) => {
  if (prevProps.messages.length !== nextProps.messages.length) return false;
  if (prevProps.isLoading !== nextProps.isLoading) return false;
  return isEqual(prevProps.messages, nextProps.messages);
});

export default Messages;
