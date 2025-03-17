import { isEqual } from "lodash";
import { memo } from "react";

import Message from "@/components/chat/message";
import ThinkingMessage from "@/components/chat/thinking-message";
import { ChatMessage } from "@/components/chat/types";
import useScrollToBottom from "@/components/chat/use-scroll-to-bottom";

interface MessagesProps {
  messages: ChatMessage[];
  isLoading: boolean;
}

const PureMessages = ({ messages, isLoading }: MessagesProps) => {
  const [messagesContainerRef, messagesEndRef] = useScrollToBottom<HTMLDivElement>();

  return (
    <div ref={messagesContainerRef} className="flex flex-col min-w-0 flex-1 overflow-y-scroll pt-4">
      {messages.map((message) => (
        <Message key={message.id} message={message} />
      ))}
      {isLoading && messages?.length > 0 && <ThinkingMessage />}

      <div ref={messagesEndRef} className="shrink-0 min-w-[24px] min-h-[24px]" />
    </div>
  );
};

const Messages = memo(PureMessages, (prevProps, nextProps) => {
  if (prevProps.messages.length !== nextProps.messages.length) return false;
  if (prevProps.isLoading !== nextProps.isLoading) return false;
  return isEqual(prevProps.messages, nextProps.messages);
});

export default Messages;
