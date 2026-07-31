"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { ElevationBadge } from "./elevation-badge";

/**
 * A row of every overlay primitive. Each opens a couple of levels above the surface it was
 * triggered from (the badge inside proves the level it resolved to) — drop this inside
 * surfaces at different elevations to see the overlays track their origin.
 */
export function Overlays() {
  return (
    <div className="flex flex-wrap gap-2">
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline">Dialog</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
            <DialogDescription>Dialogs open two levels above their trigger&apos;s surface.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="demo-name">Name</Label>
            <Input id="demo-name" defaultValue="my-agent" />
          </div>
          <ElevationBadge className="self-start" />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button>Save</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline">Sheet</Button>
        </SheetTrigger>
        <SheetContent className="flex flex-col gap-4">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>Sheets slide in one level above their trigger.</SheetDescription>
          </SheetHeader>
          <div className="px-4">
            <ElevationBadge />
          </div>
          <SheetFooter>
            <SheetClose asChild>
              <Button className="w-full">Apply</Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">Popover</Button>
        </PopoverTrigger>
        <PopoverContent className="space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">Quick settings</p>
            <p className="text-xs text-muted-foreground">Popovers float two levels up.</p>
          </div>
          <ElevationBadge />
        </PopoverContent>
      </Popover>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" icon="settings">
            Menu
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Duplicate</DropdownMenuItem>
          <DropdownMenuItem>Archive</DropdownMenuItem>
          <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" icon="circleAlert">
            Tooltip
          </Button>
        </TooltipTrigger>
        <TooltipContent>Tooltips are surfaces too</TooltipContent>
      </Tooltip>
    </div>
  );
}
