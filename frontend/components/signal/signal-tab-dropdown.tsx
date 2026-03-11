"use client";

import { ChevronDown } from "lucide-react";
import { forwardRef } from "react";

const TABS = [
  { value: "events", label: "Events" },
  { value: "triggers", label: "Triggers" },
  { value: "jobs", label: "Jobs" },
  { value: "runs", label: "Runs" },
] as const;

interface SignalTabDropdownProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  activeTab: string;
}

const SignalTabDropdown = forwardRef<HTMLButtonElement, SignalTabDropdownProps>(({ activeTab, ...props }, ref) => {
  const activeLabel = TABS.find((t) => t.value === activeTab)?.label ?? "Events";

  return (
    <button
      ref={ref}
      className="flex items-center gap-1 px-2 p-0.5 rounded-lg hover:bg-muted text-secondary-foreground outline-none"
      {...props}
    >
      {activeLabel}
      <ChevronDown className="size-3.5 text-secondary-foreground/60" />
    </button>
  );
});

SignalTabDropdown.displayName = "SignalTabDropdown";

export default SignalTabDropdown;
