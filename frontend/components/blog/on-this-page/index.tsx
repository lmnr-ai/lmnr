"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export interface Heading {
  id: string;
  text: string;
  depth: number;
}

interface OnThisPageProps {
  headings: Heading[];
  className?: string;
}

export default function OnThisPage({ headings, className }: OnThisPageProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (headings.length === 0) return;

    const elements = headings.map((h) => document.getElementById(h.id)).filter((el): el is HTMLElement => !!el);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
    setActiveId(id);
  };

  return (
    <nav aria-label="On this page" className={cn("max-h-[calc(100vh-8rem)] overflow-y-auto", className)}>
      <div className="text-xs uppercase tracking-wider text-landing-text-400 mb-3">On this page</div>
      <ul className="flex flex-col gap-2 text-sm">
        {headings.map((h) => {
          const active = h.id === activeId;
          return (
            <li key={h.id} className={cn(h.depth >= 3 ? "pl-3" : "")}>
              <a
                href={`#${h.id}`}
                onClick={(e) => handleClick(e, h.id)}
                className={cn(
                  "block leading-snug transition-colors no-underline",
                  active ? "text-landing-text-100 font-medium" : "text-landing-text-400 hover:text-landing-text-200"
                )}
              >
                {h.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
