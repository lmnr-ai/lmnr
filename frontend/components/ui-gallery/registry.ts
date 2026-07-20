import type React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * A gallery entry. `variants` maps a prop name to its list of allowed string
 * values, copied by hand from the component's cva config (types are erased at
 * runtime and cva doesn't reliably expose its variants config, so we declare
 * them here). Adding a component = appending one entry.
 */
export interface GalleryEntry {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Component: React.ComponentType<any>;
  variants: Record<string, string[]>;
  defaultProps?: Record<string, unknown>;
  sampleChildren?: React.ReactNode;
}

export const registry: GalleryEntry[] = [
  {
    name: "Button",
    Component: Button,
    // from components/ui/button.tsx buttonVariants
    variants: {
      variant: [
        "default",
        "destructive",
        "destructiveOutline",
        "warning",
        "warningOutline",
        "outline",
        "outlinePrimary",
        "secondary",
        "secondaryLight",
        "ghost",
        "light",
        "lightSecondary",
        "link",
      ],
      size: ["default", "sm", "md", "lg", "icon", "icon-sm", "icon-xs"],
    },
    sampleChildren: "Button",
  },
  {
    name: "Badge",
    Component: Badge,
    // from components/ui/badge.tsx badgeVariants (no size variant)
    variants: {
      variant: ["default", "secondary", "destructive", "outline", "outlinePrimary"],
    },
    sampleChildren: "Badge",
  },
];
