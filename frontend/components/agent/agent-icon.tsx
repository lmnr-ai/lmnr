import { type SVGProps } from "react";

interface AgentIconProps extends Omit<SVGProps<SVGSVGElement>, "width" | "height"> {
  size?: number;
  /** Ring thickness, in px at the default 16px size. */
  strokeWidth?: number;
}

const OUTER_RADIUS = 7;
// Transparent gap between the ring and the dot, so whatever is behind the icon shows through.
const GAP = 1;

// Laminar agent mark: a ring with a dot inside, both currentColor. Like Lucide, the 14px artwork
// sits inset in a 16px box.
export default function AgentIcon({ size = 16, strokeWidth = 1.5, ...props }: AgentIconProps) {
  const dotRadius = Math.max(0, OUTER_RADIUS - strokeWidth - GAP);
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <circle cx="8" cy="8" r={OUTER_RADIUS - strokeWidth / 2} stroke="currentColor" strokeWidth={strokeWidth} />
      <circle cx="8" cy="8" r={dotRadius} fill="currentColor" />
    </svg>
  );
}
