import OnThisPage, { type Heading } from "@/components/blog/on-this-page";
import { cn } from "@/lib/utils";

interface PostMetadataRailProps {
  headings: Heading[];
  className?: string;
}

export default function PostMetadataRail({ headings, className }: PostMetadataRailProps) {
  if (headings.length === 0) return null;

  return (
    <div className={cn("flex flex-col text-sm", className)}>
      <OnThisPage headings={headings} />
    </div>
  );
}
