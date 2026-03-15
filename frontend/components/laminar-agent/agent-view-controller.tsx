"use client";

import { AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

import CollapsedFab from "./collapsed-fab";
import FloatingSidebar from "./floating-sidebar";
import { useLaminarAgentStore } from "./store";
import { getPageContext } from "./url-context";

export default function AgentViewController() {
  const viewMode = useLaminarAgentStore((s) => s.viewMode);
  const pathname = usePathname();

  const isAgentFullscreenPage = pathname.endsWith("/agent");
  const pageContext = useMemo(() => getPageContext(pathname), [pathname]);

  return (
    <AnimatePresence mode="wait">
      {viewMode === "collapsed" && !isAgentFullscreenPage && (
        <CollapsedFab key="fab" suggestions={pageContext.suggestions} />
      )}
      {viewMode === "floating" && !isAgentFullscreenPage && <FloatingSidebar key="floating" />}
    </AnimatePresence>
  );
}
