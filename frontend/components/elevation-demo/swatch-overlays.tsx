"use client";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { ElevationBadge } from "./elevation-badge";
import { SurfaceSwatches } from "./surface-swatches";

/**
 * The bump swatches rendered INSIDE a popover and a tooltip. Both are painted surfaces two
 * levels above their trigger, so the swatches should step from the overlay's own level — the
 * badge shows that level, and each swatch is labeled with its utility so you can eyeball that
 * `bg-surface-up` / `-down` resolve relative to the overlay, not the page.
 */
export function SwatchOverlays() {
  return (
    <div className="flex flex-wrap gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">Swatches in a popover</Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Bump utilities, resolved here</p>
            <ElevationBadge />
          </div>
          <SurfaceSwatches />
        </PopoverContent>
      </Popover>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline">Swatches in a tooltip</Button>
        </TooltipTrigger>
        <TooltipContent className="w-80 space-y-3 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">Bump utilities, resolved here</p>
            <ElevationBadge />
          </div>
          <SurfaceSwatches />
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
