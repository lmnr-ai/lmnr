import { cn } from "@/lib/utils";

interface SkeletonProps {
  width?: string;
  className?: string;
}

const Skeleton = ({ width = "w-24", className }: SkeletonProps) => (
  <div className={cn("h-2 bg-landing-surface-500 opacity-[var(--skeleton-opacity)]", width, className)} />
);

export default Skeleton;
