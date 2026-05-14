// TODO: replace with the real per-section visuals once each section's mock
// lands. Mirrors the Figma placeholder rectangle (390×171, landing-surface-600)
// at node 4054:8143 etc.

import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

const PlaceholderVisual = ({ className }: Props) => (
  <div className={cn("w-full max-w-[390px] aspect-[390/171] rounded bg-landing-surface-600", className)} />
);

export default PlaceholderVisual;
