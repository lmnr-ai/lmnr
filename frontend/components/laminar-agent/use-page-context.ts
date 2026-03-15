"use client";

import { usePathname } from "next/navigation";
import { useMemo } from "react";

import { setCurrentUrlContext } from "./store";
import { getPageContext, type PageContext } from "./url-context";

/**
 * Hook that extracts page context from the current URL pathname.
 * Updates the mutable URL context ref so the chat transport can
 * include it in requests. Returns the current page context.
 */
export function usePageContext(): PageContext {
  const pathname = usePathname();

  const pageContext = useMemo(() => {
    const ctx = getPageContext(pathname);
    // Update the mutable ref for the chat transport body
    setCurrentUrlContext({
      pageType: ctx.pageType,
      ids: ctx.ids,
      systemPromptFragment: ctx.systemPromptFragment,
    });
    return ctx;
  }, [pathname]);

  return pageContext;
}
