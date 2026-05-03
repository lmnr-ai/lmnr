import Link from "next/link";
import { type ReactNode } from "react";

const MARKDOWN_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;

export const LinkText = ({ text }: { text: string }) => {
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(MARKDOWN_LINK_RE)) {
    const [full, label, url] = match;
    const idx = match.index!;
    if (idx > lastIndex) {
      parts.push(text.slice(lastIndex, idx));
    }

    let href = url;
    try {
      const parsed = new URL(url);
      if (
        parsed.hostname === "laminar.sh" ||
        parsed.hostname.endsWith(".laminar.sh") ||
        parsed.hostname === "lmnr.ai" ||
        parsed.hostname.endsWith(".lmnr.ai")
      ) {
        href = parsed.pathname + parsed.search;
      }
    } catch {
      /* keep absolute url */
    }

    parts.push(
      <Link key={idx} href={href} className="underline hover:text-foreground" onClick={(e) => e.stopPropagation()}>
        {label}
      </Link>
    );
    lastIndex = idx + full.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts.length > 0 ? parts : text}</>;
};
