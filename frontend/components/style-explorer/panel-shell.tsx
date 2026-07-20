"use client";

// TEMPORARY style exploration tooling — safe to delete this folder + the mount in layout.tsx.
// Floating button (collapsed) + HUD window (expanded) with Color | JSON tabs.

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Palette, X } from "@/components/ui/icon-lib";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import ColorTab from "./color-tab";
import IconsTab from "./icons-tab";
import JsonTab from "./json-tab";

export default function PanelShell() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button
        variant="secondary"
        size="icon"
        aria-label="Open style explorer"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-[9999] rounded-full shadow-lg"
      >
        <Palette className="size-4" />
      </Button>
    );
  }

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-[9999] flex w-[420px] max-w-[calc(100vw-2rem)] flex-col",
        "max-h-[80vh] rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl"
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Palette className="size-4" />
          Style Explorer
        </div>
        <Button variant="ghost" size="icon" aria-label="Close style explorer" onClick={() => setOpen(false)}>
          <X className="size-4" />
        </Button>
      </div>
      <Tabs defaultValue="color" className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <TabsList className="w-full">
          <TabsTrigger value="color" className="flex-1">
            Color
          </TabsTrigger>
          <TabsTrigger value="icons" className="flex-1">
            Icons
          </TabsTrigger>
          <TabsTrigger value="json" className="flex-1">
            JSON
          </TabsTrigger>
        </TabsList>
        <div className="min-h-0 flex-1 overflow-y-auto thin-scrollbar pr-1">
          <TabsContent value="color">
            <ColorTab />
          </TabsContent>
          <TabsContent value="icons">
            <IconsTab />
          </TabsContent>
          <TabsContent value="json">
            <JsonTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
