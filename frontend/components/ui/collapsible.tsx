"use client";

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import * as React from "react";

const Collapsible = CollapsiblePrimitive.Root;

function CollapsibleTrigger({
  asChild = false,
  children,
  ...props
}: CollapsiblePrimitive.Trigger.Props & { asChild?: boolean }) {
  if (asChild) {
    const child = React.Children.only(children) as React.ReactElement;
    return <CollapsiblePrimitive.Trigger render={child} nativeButton={false} {...props} />;
  }
  return <CollapsiblePrimitive.Trigger {...props}>{children}</CollapsiblePrimitive.Trigger>;
}

/** Public name kept as Content; maps to Base UI Panel. */
const CollapsibleContent = CollapsiblePrimitive.Panel;

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
