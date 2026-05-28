import Link from "next/link";
import { type HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type HeadingProps = HTMLAttributes<HTMLHeadingElement>;
type Level = 0 | 1 | 2 | 3;

interface MDHeadingProps {
  props: HeadingProps;
  level: Level;
}

// `id` lands on the heading's `props` via the rehype-slug plugin (configured in
// post-content/index.tsx). Spreading `{...props}` is enough — no manual id
// derivation here. We previously computed `id={headingToUrl(props.children)}`
// which produced collisions when two headings shared text (e.g. five `### Laminar`
// sub-sections in a comparison post). rehype-slug walks the tree in a single
// pass with a github-slugger counter, so collisions become `laminar-1`,
// `laminar-2`, etc. `parseHeadings` mirrors the same logic so TOC anchors
// agree with the rendered DOM ids.
export default function MDHeading({ props, level }: MDHeadingProps) {
  return (
    <div className="flex space-x-2 group">
      <HeadingContent props={props} level={level} />
      <Link
        href={`#${props.id ?? ""}`}
        className={cn(
          "cursor-pointer group-hover:block group-hover:underline hidden text-secondary-foreground",
          levelToClassName(level)
        )}
      >
        #
      </Link>
    </div>
  );
}

function HeadingContent({ props, level }: { props: HeadingProps; level: Level }) {
  switch (level) {
    case 0:
      return <h1 {...props} className={levelToClassName(level)} />;
    case 1:
      return <h2 {...props} className={levelToClassName(level)} />;
    case 2:
      return <h3 {...props} className={levelToClassName(level)} />;
    case 3:
      return <h4 {...props} className={levelToClassName(level)} />;
    default:
      return <h1 {...props} className={levelToClassName(level)} />;
  }
}

function levelToClassName(level: number) {
  switch (level) {
    case 0:
      return "text-3xl font-medium font-sans-landing";
    case 1:
      return "text-2xl pt-4 font-medium font-sans-landing mt-8";
    case 2:
      return "text-xl pt-4 font-medium font-sans-landing mt-8";
    case 3:
      return "text-lg pt-4 font-medium font-sans-landing mt-8";
    default:
      return "text-3xl font-medium font-sans-landing";
  }
}
