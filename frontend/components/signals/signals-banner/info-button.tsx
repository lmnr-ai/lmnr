"use client";

import { Info } from "lucide-react";

import { Button } from "@/components/ui/button";

import { useSignalsBannerStore } from "./store";

export function SignalsBannerInfoButton() {
  const { show } = useSignalsBannerStore();

  return (
    <Button
      onClick={show}
      variant="ghost"
      size="icon-sm"
      className="text-muted-foreground hover:text-foreground"
      aria-label="Show signals info"
    >
      <Info className="size-3.5" />
    </Button>
  );
}
