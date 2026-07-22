"use client";

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";

const Collapsible = CollapsiblePrimitive.Root;

function CollapsibleTrigger({ ...props }: CollapsiblePrimitive.Trigger.Props) {
  return <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />;
}

/** Public name kept as Content; maps to Base UI Panel. */
const CollapsibleContent = CollapsiblePrimitive.Panel;

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
