import { isEqual } from "lodash";
import { memo } from "react";

import Message from "@/components/chat/message";
import { ChatMessage } from "@/components/chat/types";
import useScrollToBottom from "@/components/chat/use-scroll-to-bottom";

interface MessagesProps {
  messages: ChatMessage[];
}

const PureMessages = ({ messages }: MessagesProps) => {
  const [messagesContainerRef, messagesEndRef] = useScrollToBottom<HTMLDivElement>();

  const abc = "";
  return (
    <div ref={messagesContainerRef} className="flex flex-col min-w-0 gap-6 flex-1 overflow-y-scroll pt-4">
      {messages.map((message) => (
        <Message key={message.id} message={message} isLoading={false} />
      ))}

      <div ref={messagesEndRef} className="shrink-0 min-w-[24px] min-h-[24px]" />
    </div>
  );
};

const Messages = memo(PureMessages, (prevProps, nextProps) => {
  if (prevProps.messages.length !== nextProps.messages.length) return false;
  return isEqual(prevProps.messages, nextProps.messages);
});

export default Messages;
