"use client";

import { Moon, Sun } from "lucide-react";

import { useAppTheme } from "@/components/theme/app-theme-provider";
import { type AppTheme } from "@/lib/app-theme";
import { cn } from "@/lib/utils";

const options = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] satisfies { value: AppTheme; label: string; icon: typeof Sun }[];

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useAppTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn("relative grid grid-cols-2 rounded-full bg-surface-down-2 p-0.5", className)}
    >
      {/* Equal-width columns let the thumb slide by exactly its own width. */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-full bg-surface-up shadow-sm transition-transform duration-200 ease-out",
          theme === "dark" && "translate-x-full"
        )}
      />
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          onClick={() => setTheme(value)}
          className={cn(
            "relative z-10 flex h-7 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2.5 text-xs transition-colors",
            theme === value ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="size-4" />
          {label}
        </button>
      ))}
    </div>
  );
}
