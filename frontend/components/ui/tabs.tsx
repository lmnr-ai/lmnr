"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { useDialKit } from "dialkit";
import { motion } from "framer-motion";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Sandbox-only live-tuning dial SHARED across the tabs list + triggers (stable `id: "tabs"`):
 * `slideAnimation` swaps the Radix data-state background jump for a Framer `layoutId` pill that
 * slides between triggers; `decoration` toggles the list container fill. Remove this hook + its
 * call sites (bake the chosen values) before it leaves the sandbox branch — see CLAUDE.md.
 */
function useTabsDials() {
  return useDialKit(
    "Tabs",
    {
      slideAnimation: true,
      decoration: { type: "select", options: ["old", "style-1"], default: "old" },
    },
    { id: "tabs", persist: true }
  );
}

// Radix exposes the active tab only as a DOM `data-state`; the layoutId pill needs it in React,
// so the root mirrors the value here. `layoutId` scopes the shared-layout animation to THIS Tabs
// instance (a global id would make two tab groups on one page animate into each other).
const TabsContext = React.createContext<{ selectedValue?: string; layoutId: string }>({ layoutId: "tabs" });

function Tabs({
  className,
  value,
  defaultValue,
  onValueChange,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  const layoutId = React.useId();
  const [selectedValue, setSelectedValue] = React.useState<string | undefined>(value ?? defaultValue);

  // Follow the prop when controlled; own the value when uncontrolled. Indicator-only — Radix still
  // drives actual activation, so a one-tick lag here self-corrects.
  React.useEffect(() => {
    if (value !== undefined) setSelectedValue(value);
  }, [value]);

  const handleValueChange = React.useCallback(
    (next: string) => {
      setSelectedValue(next);
      onValueChange?.(next);
    },
    [onValueChange]
  );

  return (
    <TabsContext.Provider value={{ selectedValue, layoutId }}>
      <TabsPrimitive.Root
        data-slot="tabs"
        value={value}
        defaultValue={defaultValue}
        onValueChange={handleValueChange}
        className={cn("flex flex-col gap-2", className)}
        {...props}
      />
    </TabsContext.Provider>
  );
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  const dials = useTabsDials();
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "relative text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]",
        dials.decoration === "old" && "bg-muted",
        className
      )}
      {...props}
    />
  );
}

function TabsTrigger({ className, value, children, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const { selectedValue, layoutId } = React.useContext(TabsContext);
  const dials = useTabsDials();
  const isActive = selectedValue === value;

  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      value={value}
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] text-foreground dark:text-muted-foreground dark:data-[state=active]:text-foreground focus-visible:ring-ring/50 focus-visible:outline-ring focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        // Radix data-state background — only when the sliding pill is off, else they double-paint.
        !dials.slideAnimation &&
          "data-[state=active]:bg-background dark:data-[state=active]:bg-input/30 data-[state=active]:shadow-sm",
        className
      )}
      {...props}
    >
      {dials.slideAnimation && isActive && (
        <motion.div
          layoutId={`tabs-active-${layoutId}`}
          className="absolute inset-0 z-0 rounded-md bg-background shadow-sm dark:bg-input/30 dark:border dark:border-input"
          transition={{ type: "spring", duration: 0.2, bounce: 0 }}
        />
      )}
      <span className="relative z-10 inline-flex items-center gap-1.5">{children}</span>
    </TabsPrimitive.Trigger>
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 min-h-0 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
