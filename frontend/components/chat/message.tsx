import { AnimatePresence, motion } from "framer-motion";
import { SparklesIcon } from "lucide-react";

import { Markdown } from "@/components/chat/markdown";
import { ChatMessage } from "@/components/chat/types";
import { cn } from "@/lib/utils";

interface MessageProps {
  message: ChatMessage;
  isLoading: boolean;
}

const Message = ({ message, isLoading }: MessageProps) => {
  const abc = "";
  return (
    <AnimatePresence>
      <motion.div
        className="w-full mx-auto max-w-3xl px-4 group/message"
        initial={{ y: 5, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        data-role={message.role}
      >
        <div
          className={cn(
            "flex gap-4 w-full",
            "group-data-[role=user]/message:ml-auto group-data-[role=user]/message:w-fit group-data-[role=user]/message:max-w-2xl"
          )}
        >
          {message.role === "assistant" && (
            <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border bg-background">
              <div className="translate-y-px">
                <SparklesIcon size={14} />
              </div>
            </div>
          )}
          {message.content && (
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
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default Message;
