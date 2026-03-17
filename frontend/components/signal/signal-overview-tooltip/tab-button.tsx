"use client";

import { cn } from "@/lib/utils";

interface TabButtonProps {
  tab: string;
  activeTab: string;
  onClick: () => void;
  title: string;
  description: string;
}

export default function TabButton({ tab, activeTab, onClick, title, description }: TabButtonProps) {
  const isActive = activeTab === tab;
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-left px-3 py-2 rounded border transition-colors",
        isActive ? "border-border bg-muted hover:bg-muted/80" : "border-border/50 hover:bg-sidebar-border/50"
      )}
    >
      <span className={cn("text-xs", isActive ? "text-white" : "text-secondary-foreground")}>{title}</span>
      <p className={cn("text-xs", isActive ? "text-secondary-foreground" : "text-muted-foreground")}>{description}</p>
    </button>
  );
}
