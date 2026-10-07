"use client";

import { X } from "lucide-react";

import GitHubStarsButton from "@/components/landing/header/github-stars-button.tsx";
import { SidebarMenuItem } from "@/components/ui/sidebar.tsx";
import { useLocalStorage } from "@/hooks/use-local-storage.tsx";

export default function OpenSourceCard() {
  const [showStarCard, setShowStarCard, isHydrated] = useLocalStorage("showStarCard", true);

  if (!isHydrated || !showStarCard) return null;

  return (
    <SidebarMenuItem>
      <div className="flex flex-col gap-1.5 rounded-lg bg-surface-200 p-2">
        <div className="flex items-start justify-between">
          <p className="text-xs text-foreground-300">Laminar is open-source</p>
          <button
            aria-label="Close"
            onClick={() => setShowStarCard(false)}
            className="size-3.5 text-foreground-300 hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <GitHubStarsButton
          owner="lmnr-ai"
          repo="lmnr"
          className="h-6 w-full justify-center rounded bg-surface-400 px-1 [&_span]:text-foreground-200 [&_svg]:text-foreground-200"
        />
      </div>
    </SidebarMenuItem>
  );
}
