import { motion } from "framer-motion";
import Image from "next/image";

import logo from "@/assets/logo/icon.svg";
import { cn } from "@/lib/utils";

const ThinkingMessage = () => {
  const role = "assistant";

  return (
    <motion.div
      data-testid="message-assistant-loading"
      className="w-full mx-auto max-w-3xl px-4 group/message "
      initial={{ y: 5, opacity: 0 }}
      animate={{ y: 0, opacity: 1, transition: { delay: 1 } }}
      data-role={role}
    >
      <div
        className={cn(
          "flex gap-4 group-data-[role=user]/message:px-3 w-full group-data-[role=user]/message:w-fit group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl group-data-[role=user]/message:py-2 rounded-xl",
          {
            "group-data-[role=user]/message:bg-muted": true,
          }
        )}
      >
        <div className="h-fit w-fit p-2 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border">
          <Image alt="logo" src={logo} width={14} priority />
        </div>

        <div className="flex flex-col gap-2 w-full">
          <div className="flex flex-col gap-4 text-muted-foreground animate-pulse">Thinking...</div>
        </div>
      </div>
    </motion.div>
  );
};

export default ThinkingMessage;
