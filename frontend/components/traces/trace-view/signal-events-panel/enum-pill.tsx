import { cn } from "@/lib/utils";

import { CHIP } from "./constants";

/** An enum payload value. No arrow — that marks the other chips as links out, and
 *  this navigates nowhere. Wider inset: bare text has no glyphs to stand it off. */
export default function EnumPill({ value }: { value: string }) {
  return <span className={cn(CHIP, "inline-flex px-2.5 text-secondary-foreground bg-signal/14")}>{value}</span>;
}
