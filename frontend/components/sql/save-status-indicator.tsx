"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CircleAlert, Loader2 } from "lucide-react";

import { type SaveStatus } from "@/components/sql/sql-editor-store";
import { cn } from "@/lib/utils";

/** Quiet pending/error glyph — hidden when the query is persisted. */
const SaveStatusIndicator = ({ status }: { status: SaveStatus }) => {
  const reduceMotion = useReducedMotion();
  const isError = status === "error";
  const visible = status !== "saved";

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.span
          // Unsaved and saving share one chip so the spinner doesn't remount mid-debounce.
          key={isError ? "error" : "pending"}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          role="status"
          aria-label={isError ? "Not saved" : "Saving"}
          className={cn("flex shrink-0 items-center", isError ? "text-destructive" : "text-muted-foreground")}
        >
          {isError ? <CircleAlert className="size-3.5" /> : <Loader2 className="size-3.5 animate-spin" />}
        </motion.span>
      )}
    </AnimatePresence>
  );
};

export default SaveStatusIndicator;
