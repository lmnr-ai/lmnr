"use client";

// Demonstrates the relative surface system: raw <Elevated> panels nested with the
// conventional offsets, each labelled with the level it actually resolved to. The
// point is legibility at depth — every panel stays distinct from its substrate.

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Elevated, SURFACE_BG, SURFACE_OFFSET, useSurface } from "@/components/ui/surface";

// Reads the level from context so each panel can print where it landed.
function LevelLabel({ children }: { children: string }) {
  const level = useSurface();
  return (
    <div className="mb-3 flex items-center justify-between text-xs">
      <span className="font-medium text-foreground">{children}</span>
      <span className="rounded bg-black/20 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
        surface-{level * 100}
      </span>
    </div>
  );
}

export default function SurfacesDemo() {
  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-prose text-sm text-muted-foreground">
        Each panel lifts a fixed number of steps above the surface it sits on and re-provides that level to its
        children, so nesting walks up the ladder automatically. Background tracks the level; the shadow recipe
        deepens with it. A popover opened four layers down still reads as a popover.
      </p>

      {/* The bare page is level 1 (the default substrate). */}
      <div className="rounded-lg border border-border p-4">
        <LevelLabel>Page (base substrate)</LevelLabel>

        <Elevated offset={SURFACE_OFFSET.inline} className="rounded-lg p-4">
          <LevelLabel>Card · offset inline (+1)</LevelLabel>

          <Elevated offset={SURFACE_OFFSET.dialog} className="rounded-lg p-4">
            <LevelLabel>Dialog · offset dialog (+2)</LevelLabel>

            <Elevated offset={SURFACE_OFFSET.popover} shadowLevel={3} className="rounded-lg p-4">
              <LevelLabel>Popover · offset popover (+2)</LevelLabel>

              <Elevated offset={SURFACE_OFFSET.menu} shadowLevel={3} className="rounded-lg p-4">
                <LevelLabel>Dropdown · offset menu (+1)</LevelLabel>
                <div className="text-sm text-muted-foreground">Still distinct from every layer beneath it.</div>
              </Elevated>
            </Elevated>
          </Elevated>
        </Elevated>
      </div>

      {/* Live proof: real portaled overlays nested. Each portals to the document
          root, yet reads the level of what it opened from — context crosses the portal. */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
          Live overlays (open them)
        </span>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">Open dialog → popover → dropdown</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Dialog</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              This dialog is elevated off the page. Open the popover inside it — it lifts again, off the dialog.
            </p>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-fit">
                  Open popover
                </Button>
              </PopoverTrigger>
              <PopoverContent className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">Still legible on top of the dialog.</p>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-fit">
                      Open dropdown
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem>Three layers deep</DropdownMenuItem>
                    <DropdownMenuItem>and still distinct</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </PopoverContent>
            </Popover>
          </DialogContent>
        </Dialog>
      </div>

      {/* A flat swatch strip of the raw scale, for reference. */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">Scale</span>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <div key={n} className={`flex h-12 flex-1 items-end justify-center rounded pb-1 ${SURFACE_BG[n]}`}>
              <span className="font-mono text-[10px] text-muted-foreground">{n * 100}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
