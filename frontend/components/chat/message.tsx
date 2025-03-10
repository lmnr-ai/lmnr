import type { Message } from "ai";
import { AnimatePresence, motion } from "framer-motion";

import { Markdown } from "@/components/chat/markdown";
import { MessageReasoning } from "@/components/chat/message-reasoning";
import { cn } from "@/lib/utils";

interface MessageProps {
  chatId: string;
  message: Message;
  isLoading: boolean;
}

const Message = ({ message, chatId, isLoading }: MessageProps) => {
  const abc = "";
  return (
    <AnimatePresence>
      <motion.div>
        {message?.parts && <MessageReasoning isLoading={isLoading} reasoning={message.reasoning} />}

        {(message.content || message.parts) && (
          <div data-testid="message-content" className="flex flex-row gap-2 items-start">
            <div
              className={cn("flex flex-col gap-4", {
                "bg-primary text-primary-foreground px-3 py-2 rounded-xl": message.role === "user",
              })}
            >
              <Markdown>{message.content as string}</Markdown>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default Message;
