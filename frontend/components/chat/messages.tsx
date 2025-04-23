import { isEqual, last } from "lodash";
import { memo } from "react";

import Message from "@/components/chat/message";
import ThinkingMessage from "@/components/chat/thinking-message";
import { ChatMessage } from "@/components/chat/types";
import useScrollToBottom from "@/components/chat/use-scroll-to-bottom";
import { Button } from "@/components/ui/button";

import { ScrollArea } from "../ui/scroll-area";

interface MessagesProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onControl: () => void;
}

const PureMessages = ({ messages, isLoading, onControl }: MessagesProps) => {
  const [ref, messagesEndRef] = useScrollToBottom<HTMLDivElement>();

  const lastMessage = last(messages);

  return (
    <ScrollArea className="flex-1">
      <div ref={ref} className="flex flex-col min-w-0 pt-4">
        {messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}
        {isLoading && messages?.length > 0 && <ThinkingMessage />}
        {lastMessage?.messageType === "assistant" && lastMessage?.content.actionResult?.giveControl && (
          <div className="mx-auto max-w-3xl w-full -mt-2 px-4">
            <Button onClick={onControl} className="ml-12">
              Take Control
            </Button>
          </div>
        )}
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
