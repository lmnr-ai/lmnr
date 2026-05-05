import { Link2 } from "lucide-react";
import Link from "next/link";
import { Children, isValidElement, type ReactNode } from "react";

import { headingToUrl } from "@/lib/blog/utils";
import { cn } from "@/lib/utils";

interface MDHeadingProps {
  props: any;
  level: number;
}

const childrenToText = (children: ReactNode): string => {
  let text = "";
  Children.forEach(children, (child) => {
    if (child == null || typeof child === "boolean") return;
    if (typeof child === "string" || typeof child === "number") {
      text += String(child);
    } else if (isValidElement(child)) {
      const childProps = child.props as { children?: ReactNode; alt?: string };
      const nested = childrenToText(childProps.children);
      text += nested || (typeof childProps.alt === "string" ? childProps.alt : "");
    }
  });
  return text;
};

const levelToClassName = (level: number) => {
  switch (level) {
    case 0:
      return "text-3xl md:text-4xl font-semibold font-space-grotesk tracking-tight text-landing-text-100 mt-12 mb-4 scroll-mt-24";
    case 1:
      return "text-2xl md:text-3xl font-semibold font-space-grotesk tracking-tight text-landing-text-100 mt-12 mb-4 scroll-mt-24";
    case 2:
      return "text-xl font-semibold font-space-grotesk tracking-tight text-landing-text-100 mt-8 mb-3 scroll-mt-24";
    case 3:
      return "text-lg font-semibold font-space-grotesk tracking-tight text-landing-text-100 mt-6 mb-2 scroll-mt-24";
    default:
      return "text-3xl font-semibold font-space-grotesk tracking-tight text-landing-text-100";
  }
};

const HeadingTag = ({ level, ...rest }: { level: number } & React.HTMLAttributes<HTMLHeadingElement>) => {
  switch (level) {
    case 0:
      return <h1 {...rest} />;
    case 1:
      return <h2 {...rest} />;
    case 2:
      return <h3 {...rest} />;
    case 3:
      return <h4 {...rest} />;
    default:
      return <h1 {...rest} />;
  }
};

export default function MDHeading({ props, level }: MDHeadingProps) {
  const id = headingToUrl(childrenToText(props.children));
  return (
    <HeadingTag level={level} id={id} className={cn("group relative flex items-center gap-2", levelToClassName(level))}>
      <span>{props.children}</span>
      <Link
        href={`#${id}`}
        aria-label="Permalink"
        className="opacity-0 group-hover:opacity-100 transition-opacity text-landing-text-400 hover:text-landing-text-200"
      >
        <Link2 className="size-4" />
      </Link>
    </HeadingTag>
  );
}
