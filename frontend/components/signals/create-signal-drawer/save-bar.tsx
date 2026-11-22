"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SaveBarProps {
  isDirty: boolean;
  isValid: boolean;
  isLoading: boolean;
}

/** True while the sticky element is pinned: at `-bottom-px` a stuck bar always has 1px clipped off. */
function useIsStuck() {
  const ref = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setIsStuck(entry.intersectionRatio < 1), {
      threshold: [1],
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, isStuck };
}

/**
 * Sticky to the bottom of the nearest scroll container, so it pins to the bottom edge while the form runs past the
 * viewport and settles into its natural spot at the end. The fixed height reserves that spot, so
 * the bar appearing never shifts the layout.
 */
export default function SaveBar({ isDirty, isValid, isLoading }: SaveBarProps) {
  const { ref, isStuck } = useIsStuck();
  return (
    <div ref={ref} className="sticky -bottom-px z-10 -mx-1 h-14">
      <AnimatePresence>
        {isDirty && (
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className={cn(
              "flex h-full items-center justify-between gap-4 border-t bg-background px-1 transition-colors",
              !isStuck && "border-t-transparent"
            )}
          >
            <span className="text-sm text-muted-foreground">You have unsaved changes</span>
            <Button className="w-fit gap-2" type="submit" size="md" disabled={isLoading || !isValid}>
              <Loader2 className={cn("hidden", isLoading && "animate-spin block")} size={16} />
              Save
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
