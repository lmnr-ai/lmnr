"use client";

import { Monitor, Moon, Sun } from "lucide-react";

import { useAppTheme } from "@/components/theme/app-theme-provider";
import { type ThemePreference } from "@/lib/app-theme";
import { cn } from "@/lib/utils";

const options = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] satisfies { value: ThemePreference; label: string; icon: typeof Sun }[];

export function ThemeToggle({ className }: { className?: string }) {
  const { preference, setPreference } = useAppTheme();
  const selectedIndex = options.findIndex((o) => o.value === preference);

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn("relative grid w-fit grid-cols-3 rounded-full bg-surface-down-2 p-0.5", className)}
    >
      {/* Equal-width columns let the thumb slide by exactly its own width per step. */}
      <span
        aria-hidden
        style={{ transform: `translateX(${selectedIndex * 100}%)` }}
        className="absolute inset-y-0.5 left-0.5 w-[calc((100%-4px)/3)] rounded-full bg-surface-up shadow-sm transition-transform duration-200 ease-out"
      />
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          aria-label={label}
          title={label}
          onClick={() => setPreference(value)}
          className={cn(
            "relative z-10 flex size-7 cursor-pointer items-center justify-center rounded-full transition-colors",
            preference === value ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );
}
