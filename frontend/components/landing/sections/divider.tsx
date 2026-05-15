import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  /** "short" = 400px (within 880px column, centered by parent); "full" = 880px (w-full). */
}

// Horizontal divider line. Short variant separates "Did my fix work?" from
// "Two lines to integrate"; full variant brackets Quote and Built for
// production within the 880px column.
const Divider = ({ className }: Props) => <div className={cn("h-px bg-landing-surface-500 w-full", className)} />;

export default Divider;
