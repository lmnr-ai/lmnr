"use client";

import { useEffect, useState } from "react";

import OnThisPage, { type Heading } from "@/components/blog/on-this-page";

interface MobileTocProps {
  headings: Heading[];
}

export default function MobileToc({ headings }: MobileTocProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  if (!isMobile || headings.length === 0) return null;

  return (
    <div className="lg:hidden max-w-6xl mx-auto px-4 pt-6">
      <div className="max-w-3xl mx-auto">
        <details className="border-y border-landing-surface-500 py-4 group">
          <summary className="text-xs uppercase tracking-wider text-landing-text-400 cursor-pointer list-none flex items-center justify-between">
            <span>On this page</span>
            <span className="transition-transform group-open:rotate-90">›</span>
          </summary>
          <div className="mt-3">
            <OnThisPage headings={headings} showHeader={false} />
          </div>
        </details>
      </div>
    </div>
  );
}
