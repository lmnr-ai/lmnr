"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import SignalsUnreadBadge from "@/components/signal-clusters/unread-badge";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { SidebarMenuButton } from "@/components/ui/sidebar.tsx";

export interface SidebarSignal {
  id: string;
  name: string;
}

interface Props {
  signals: SidebarSignal[];
  hrefFor: (s: SidebarSignal) => string;
  isActive: (s: SidebarSignal) => boolean;
}

// Grace period so the pointer can cross the gap between the row and the flyout.
const CLOSE_DELAY_MS = 150;

/** "More" row that opens the remaining signals in a flyout to the right on hover. */
export default function SidebarSignalsMore({ signals, hrefFor, isActive }: Props) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = () => {
    clearTimeout(timer.current);
    setOpen(true);
  };
  const hide = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <SidebarMenuButton
          className="h-[28px] text-secondary-foreground"
          isActive={signals.some(isActive) || open}
          onMouseEnter={show}
          onMouseLeave={hide}
          onClick={show}
        >
          <span>More</span>
          <ChevronRight className="ml-auto" />
        </SidebarMenuButton>
      </PopoverAnchor>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={6}
        className="flex max-h-96 w-56 flex-col gap-0.5 overflow-y-auto p-1"
        onMouseEnter={show}
        onMouseLeave={hide}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {signals.map((s) => (
          <Link
            key={s.id}
            href={hrefFor(s)}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:overlay-hover data-[active=true]:overlay-selected"
            data-active={isActive(s)}
          >
            <span className="flex-1 truncate">{s.name}</span>
            <SignalsUnreadBadge signalId={s.id} />
          </Link>
        ))}
      </PopoverContent>
    </Popover>
  );
}
