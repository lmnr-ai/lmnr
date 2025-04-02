import { motion } from "framer-motion";
import Image from "next/image";

import logo from "@/assets/logo/icon.svg";

const ThinkingMessage = () => (
  <motion.div
    className="w-full mx-auto max-w-3xl px-4"
    initial={{ y: 5, opacity: 0 }}
    animate={{ y: 0, opacity: 1, transition: { delay: 1 } }}
  >
    <div className="flex gap-4 rounded-xl items-center">
      <div className="h-fit w-fit p-2 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border">
        <Image className="-mr-px" alt="logo" src={logo} width={16} />
      </div>
      <div className="text-muted-foreground animate-pulse">Thinking...</div>
    </div>
  </motion.div>
);

export default ThinkingMessage;
