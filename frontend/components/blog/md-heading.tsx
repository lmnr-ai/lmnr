
import Link from "next/link";

import { headingToUrl } from "@/lib/blog/utils";
import { cn } from "@/lib/utils";

interface MDHeadingProps {
  props: any;
  level: number;
}

export default function MDHeading({ props, level }: MDHeadingProps) {
  return <div className="flex space-x-2 group">
    <HeadingContent props={props} level={level} />
    <Link
      href={`#${headingToUrl(props.children as string)}`}
      className={cn("cursor-pointer group-hover:block group-hover:underline hidden text-secondary-foreground", levelToClassName(level))}
    >
      #
    </Link>
  </div>;
}

function HeadingContent({ props, level }: { props: any, level: number }) {
  switch (level) {
  case 0: return <h1 {...props} id={headingToUrl(props.children as string)} className={levelToClassName(level)} />;
  case 1: return <h2 {...props} id={headingToUrl(props.children as string)} className={levelToClassName(level)} />;
  case 2: return <h3 {...props} id={headingToUrl(props.children as string)} className={levelToClassName(level)} />;
  case 3: return <h4 {...props} id={headingToUrl(props.children as string)} className={levelToClassName(level)} />;
  default: return <h1 {...props} id={headingToUrl(props.children as string)} className={levelToClassName(level)} />;
  }
}

function levelToClassName(level: number) {
  switch (level) {
  case 0: return "text-3xl font-bold";
  case 1: return "text-2xl pt-4 font-bold";
  case 2: return "text-xl pt-4 font-bold";
  case 3: return "text-lg pt-4 font-bold";
  default: return "text-3xl font-bold";
  }
}
