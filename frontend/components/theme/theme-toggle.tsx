"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";

import { type ThemePreference } from "@/lib/app-theme";
import { cn } from "@/lib/utils";

const options = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] satisfies { value: ThemePreference; label: string; icon: typeof Sun }[];

const noopSubscribe = () => () => {};

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  // The stored theme is only known on the client; render no selection until then.
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
  const selectedIndex = mounted ? options.findIndex((o) => o.value === theme) : -1;

  const select = (value: ThemePreference) => {
    // Cross-fade the whole page; flushSync so the snapshot is taken after next-themes swaps the class.
    const apply = () => flushSync(() => setTheme(value));
    if (document.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.startViewTransition(apply);
    } else {
      apply();
    }
  };

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
        className={cn(
          "absolute inset-y-0.5 left-0.5 w-[calc((100%-4px)/3)] rounded-full bg-surface-up shadow-sm transition-transform duration-200 ease-out",
          selectedIndex < 0 && "invisible"
        )}
      />
      {options.map(({ value, label, icon: Icon }, i) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={selectedIndex === i}
          aria-label={label}
          title={label}
          onClick={() => select(value)}
          className={cn(
            "relative z-10 flex size-7 cursor-pointer items-center justify-center rounded-full transition-colors",
            selectedIndex === i ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );
}
