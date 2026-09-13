import { cn } from "@/lib/utils";

import { CHIP } from "./constants";

/** An enum payload value. A step below the link chips — it is a value, not a way
 *  out, and no arrow says so. Wider inset: bare text has no glyphs to stand it
 *  off the rounded ends. */
export default function EnumPill({ value }: { value: string }) {
  return <span className={cn(CHIP, "inline-flex bg-surface-up-2 px-2.5 text-secondary-foreground")}>{value}</span>;
}
