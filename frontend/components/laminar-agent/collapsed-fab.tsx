"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

import { useLaminarAgentStore } from "./store";

export default function CollapsedFab() {
  const setViewMode = useLaminarAgentStore((s) => s.setViewMode);

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className="fixed bottom-6 right-6 z-50"
    >
      <Button
        size="icon"
        className="h-12 w-12 rounded-full shadow-lg hover:shadow-xl transition-shadow"
        onClick={() => setViewMode("floating")}
        aria-label="Open Laminar Agent"
      >
        <Sparkles className="w-5 h-5" />
      </Button>
    </motion.div>
  );
}
