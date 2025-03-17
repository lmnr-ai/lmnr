import { AnimatePresence, motion } from "framer-motion";
import { GitCommitHorizontal, SparklesIcon } from "lucide-react";

import { Markdown } from "@/components/chat/markdown";
import { ChatMessage } from "@/components/chat/types";
import { cn } from "@/lib/utils";

interface MessageProps {
  message: ChatMessage;
}

const Message = ({ message }: MessageProps) => (
  <AnimatePresence>
    <motion.div
      className="w-full mx-auto max-w-3xl px-4 group/message"
      initial={{ y: 5, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      data-type={message.messageType}
    >
      <div
        className={cn(
          "flex gap-4 w-full mb-6",
          "group-data-[type=user]/message:ml-auto group-data-[type=user]/message:w-fit group-data-[type=user]/message:max-w-2xl",
          "group-data-[type=step]/message:mb-2"
        )}
      >
        {message.messageType === "step" && <GitCommitHorizontal className="mt-1 ml-2 mr-2" size={14} />}

        {message.messageType === "assistant" && (
          <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border bg-background">
            <div className="translate-y-px">
              <SparklesIcon size={14} />
            </div>
          </div>
        )}

        {"text" in message.content ? (
          <div className="flex flex-row gap-2 items-start">
            <div
              className={cn("flex flex-col gap-4", {
                "text-primary-foreground px-3 py-2 rounded-l-xl rounded-tr-xl bg-secondary":
                  message.messageType === "user",
              })}
            >
              <Markdown>{message.content.text}</Markdown>
            </div>
          </div>
        ) : (
          <div className="flex flex-row gap-2 items-start">
            <div className={cn("flex flex-col gap-4 text-secondary-foreground")}>
              <Markdown>{message.content.summary}</Markdown>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  </AnimatePresence>
);

export default Message;
