"use client";

import { useEffect } from "react";

import CollapsedButton from "./collapsed-button";
import FloatingPanel from "./floating-panel";
import { useLaminarAgentStore } from "./store";

export default function LaminarAgent() {
  const viewMode = useLaminarAgentStore((s) => s.viewMode);
  const setViewMode = useLaminarAgentStore((s) => s.setViewMode);
  const collapse = useLaminarAgentStore((s) => s.collapse);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+Shift+L (Mac) or Ctrl+Shift+L (Windows/Linux) to toggle agent
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "l") {
        e.preventDefault();
        if (viewMode === "collapsed") {
          setViewMode("floating");
        } else {
          collapse();
        }
        return;
      }

      // Escape to collapse from floating mode
      if (e.key === "Escape" && viewMode === "floating") {
        // Don't collapse if focus is inside a modal/dialog/dropdown
        const activeEl = document.activeElement;
        const isInsideOverlay = activeEl?.closest(
          "[role='dialog'], [role='menu'], [data-radix-popper-content-wrapper]"
        );
        if (!isInsideOverlay) {
          e.preventDefault();
          collapse();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [viewMode, setViewMode, collapse]);

  return (
    <>
      <CollapsedButton />
      <FloatingPanel />
    </>
  );
}
