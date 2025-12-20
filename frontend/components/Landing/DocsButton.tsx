import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  label?: string;
  href?: string;
}

const DocsButton = ({ className, label = "DOCS", href = "https://docs.lmnr.ai" }: Props) => {
  return (
    <Link
      href={href}
      target="_blank"
      className={cn(
        "flex gap-2 items-center no-underline text-landing-text-300 hover:text-landing-text-100 group",
        className
      )}
    >
      <p className="font-chivo-mono leading-normal text-sm  tracking-[1.68px]">{label}</p>
      <ArrowRight className="relative shrink-0 size-4 group-hover:-rotate-45 transition-all duration-100 group-hover:translate-x-1" />
    </Link>
  );
};

export default DocsButton;
