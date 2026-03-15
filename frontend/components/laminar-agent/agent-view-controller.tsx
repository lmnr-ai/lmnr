"use client";

import { AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";

import CollapsedFab from "./collapsed-fab";
import FloatingSidebar from "./floating-sidebar";
import { useLaminarAgentStore } from "./store";

export default function AgentViewController() {
  const viewMode = useLaminarAgentStore((s) => s.viewMode);
  const pathname = usePathname();

  const isAgentFullscreenPage = pathname.endsWith("/agent");

  return (
    <AnimatePresence mode="wait">
      {viewMode === "collapsed" && !isAgentFullscreenPage && <CollapsedFab key="fab" />}
      {viewMode === "floating" && !isAgentFullscreenPage && <FloatingSidebar key="floating" />}
    </AnimatePresence>
  );
}
