"use client";

import { motion } from "framer-motion";

import AgentChatPanel from "./agent-chat-panel";
import AgentModeHeader from "./agent-mode-header";

export default function FloatingSidebar() {
  return (
    <motion.div
      initial={{ x: 420, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 420, opacity: 0 }}
      transition={{ type: "spring", stiffness: 350, damping: 30 }}
      className="fixed top-3 bottom-3 right-3 w-[400px] z-50 bg-background border rounded-lg shadow-xl shadow-black/20 flex flex-col overflow-hidden"
    >
      <AgentChatPanel header={<AgentModeHeader currentMode="floating" />} maxWidth="max-w-full" />
    </motion.div>
  );
}
