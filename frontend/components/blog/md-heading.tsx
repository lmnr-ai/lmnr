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
// The anchor lives INSIDE the heading, not beside it in a wrapper div. Typeset
// spaces the block after a heading with an adjacent-sibling rule
// (`h2 + * { margin-block-start: 1em }`); a wrapper would make that rule match
// the anchor instead of the paragraph, so headings would sit too far from their
// body text. Anchor-inside-heading is also what rehype-autolink-headings emits.
export default function MDHeading({ props, level }: MDHeadingProps) {
  const anchor = (
    <Link
      href={`#${props.id ?? ""}`}
      className="not-typeset ml-2 cursor-pointer group-hover:inline group-hover:underline hidden text-secondary-foreground"
    >
      #
    </Link>
  );

  return <HeadingContent props={props} level={level} anchor={anchor} />;
}

function HeadingContent({ props, level, anchor }: { props: HeadingProps; level: Level; anchor: React.ReactNode }) {
  const { children, ...rest } = props;
  const className = cn("group font-medium font-sans-landing text-white", props.className);
  const body = (
    <>
      {children}
      {anchor}
    </>
  );

  switch (level) {
    case 1:
      return (
        <h2 {...rest} className={className}>
          {body}
        </h2>
      );
    case 2:
      return (
        <h3 {...rest} className={className}>
          {body}
        </h3>
      );
    case 3:
      return (
        <h4 {...rest} className={className}>
          {body}
        </h4>
      );
    default:
      return (
        <h1 {...rest} className={className}>
          {body}
        </h1>
      );
  }
}
