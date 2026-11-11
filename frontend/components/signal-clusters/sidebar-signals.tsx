"use client";

import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { type ComponentType, useState } from "react";
import useSWR from "swr";

import SidebarSignalsMore, { type SidebarSignal } from "@/components/signal-clusters/sidebar-signals-more";
import SignalsUnreadBadge, { SIDEBAR_SWR_OPTIONS } from "@/components/signal-clusters/unread-badge";
import { useCreateSignalSheet } from "@/components/signals/create-signal-sheet/store";
import { SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar.tsx";
import { swrFetcher } from "@/lib/api/fetch-api";
import { cn } from "@/lib/utils";

// Above this many signals, the last row becomes "More" with the rest in a flyout.
const MAX_ROWS = 4;

interface Props {
  href: string;
  icon: ComponentType<{ className?: string }>;
}

/** Signals nav entry with one sub-row per signal. */
export default function SidebarSignals({ href, icon: Icon }: Props) {
  const pathname = usePathname();
  const { projectId } = useParams();
  const { data } = useSWR<{ items: SidebarSignal[] }>(
    `/api/projects/${projectId}/signals?view=sidebar`,
    swrFetcher,
    SIDEBAR_SWR_OPTIONS
  );
  const signals = data?.items ?? [];
  const { open, openMobile, isMobile } = useSidebar();
  const openCreate = useCreateSignalSheet((state) => state.setOpen);
  const [rowsOpen, setRowsOpen] = useState(true);
  const sidebarOpen = isMobile ? openMobile : open;
  const expanded = sidebarOpen && rowsOpen;
  const hrefFor = (s: SidebarSignal) => `${href}/${s.id}`;

  const overflow = signals.length > MAX_ROWS;
  const shown = overflow ? signals.slice(0, MAX_ROWS - 1) : signals;
  const rest = overflow ? signals.slice(MAX_ROWS - 1) : [];

  return (
    <>
      <SidebarMenuItem className="h-[30px]">
        {sidebarOpen ? (
          <SidebarMenuButton className="h-[30px]" aria-expanded={rowsOpen} onClick={() => setRowsOpen((v) => !v)}>
            <Icon />
            <span className="flex-1">Signals</span>
            {/* Expanded, each signal row shows its own count. */}
            <span
              aria-hidden={expanded}
              className={cn(
                "flex transition-[opacity,translate] duration-200 ease-out",
                expanded ? "translate-x-2 opacity-0" : "translate-x-0 opacity-100"
              )}
            >
              <SignalsUnreadBadge />
            </span>
            <ChevronRight
              className={cn("text-muted-foreground transition-transform duration-200", rowsOpen && "rotate-90")}
            />
          </SidebarMenuButton>
        ) : (
          // Icon-only sidebar has no rows to expand, so the icon links to Signals.
          <SidebarMenuButton asChild className="h-[30px]" isActive={pathname.startsWith(href)} tooltip="Signals">
            <Link href={href}>
              <Icon />
              <SignalsUnreadBadge />
            </Link>
          </SidebarMenuButton>
        )}
      </SidebarMenuItem>

      {sidebarOpen && (
        // grid-rows 0fr -> 1fr animates to the rows' natural height without measuring it.
        <SidebarMenuItem
          inert={!rowsOpen}
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
            rowsOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          )}
        >
          <ul className="ml-3.5 flex min-h-0 flex-col gap-0.5 overflow-hidden border-l border-muted-foreground/30 pl-2.5">
            {shown.map((s) => (
              <li key={s.id}>
                <SidebarMenuButton asChild className="h-[28px]" isActive={pathname.startsWith(hrefFor(s))}>
                  <Link href={hrefFor(s)}>
                    <span className="truncate">{s.name}</span>
                    <SignalsUnreadBadge signalId={s.id} />
                  </Link>
                </SidebarMenuButton>
              </li>
            ))}
            {overflow && (
              <li>
                <SidebarSignalsMore
                  signals={rest}
                  hrefFor={hrefFor}
                  isActive={(sig) => pathname.startsWith(hrefFor(sig))}
                />
              </li>
            )}
            <li>
              <SidebarMenuButton
                className="h-[28px] gap-1 pl-[5px] text-muted-foreground"
                onClick={() => openCreate(true)}
              >
                <Plus />
                <span>Create signal</span>
              </SidebarMenuButton>
            </li>
          </ul>
        </SidebarMenuItem>
      )}
    </>
  );
}
