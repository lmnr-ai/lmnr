"use client";

import { Check, ChevronDown, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useStore } from "zustand";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/lib/hooks/use-toast";
import { cn, swrFetcher } from "@/lib/utils";

import { useTableConfigStore } from "../model/table-config-store";
import { useLastViewStore } from "./last-view-store";
import { type View } from "./types";

interface ViewsPickerProps {
  projectId: string;
  resourceType: string;
  onAutoSelect: (view: View) => void;
  onSelect: (view: View | null) => void;
}

export default function ViewsPicker({ projectId, resourceType, onAutoSelect, onSelect }: ViewsPickerProps) {
  const { toast } = useToast();
  const { mutate } = useSWRConfig();

  const listKey = `/api/projects/${projectId}/views?resourceType=${resourceType}`;
  const { data: views } = useSWR<View[]>(listKey, swrFetcher);

  const setLastViewId = useLastViewStore((s) => s.setLastViewId);

  const configStore = useTableConfigStore();
  const currentViewId = useStore(configStore, (s) => s.currentViewId);

  const [open, setOpen] = useState(false);
  const [didAutoSelect, setDidAutoSelect] = useState(false);

  useEffect(() => {
    if (didAutoSelect) return;
    if (!views) return;

    const lastViewId = useLastViewStore.getState().ids[`${projectId}:${resourceType}`] ?? null;
    if (lastViewId) {
      const match = views.find((v) => v.id === lastViewId);
      if (match) {
        onAutoSelect(match);
      } else {
        setLastViewId(projectId, resourceType, null);
      }
    }
    // One-shot: flips the flag so subsequent SWR revalidations don't re-fire.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDidAutoSelect(true);
  }, [views, didAutoSelect, projectId, resourceType, setLastViewId, onAutoSelect]);

  const handlePick = useCallback(
    (view: View) => {
      onSelect(view);
      setLastViewId(projectId, resourceType, view.id);
      setOpen(false);
    },
    [onSelect, setLastViewId, projectId, resourceType]
  );

  const handleReset = useCallback(() => {
    onSelect(null);
    setLastViewId(projectId, resourceType, null);
    setOpen(false);
  }, [onSelect, setLastViewId, projectId, resourceType]);

  const handleDelete = useCallback(
    async (view: View, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        const res = await fetch(`/api/projects/${projectId}/views/${view.id}`, { method: "DELETE" });
        if (!res.ok) {
          const errMessage = await res
            .json()
            .then((d) => d?.error)
            .catch(() => null);
          toast({ variant: "destructive", title: errMessage ?? "Failed to delete view" });
          return;
        }
        await mutate(listKey);
        if (currentViewId === view.id) {
          onSelect(null);
          setLastViewId(projectId, resourceType, null);
        }
      } catch {
        toast({ variant: "destructive", title: "Failed to delete view" });
      }
    },
    [projectId, listKey, mutate, currentViewId, onSelect, setLastViewId, resourceType, toast]
  );

  const selected = views?.find((v) => v.id === currentViewId) ?? null;
  const triggerLabel = selected?.name ?? "Default view";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="text-secondary-foreground gap-1.5">
          <span className="truncate max-w-[180px]">{triggerLabel}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[280px] p-0">
        <Command>
          <CommandInput placeholder="Search views..." className="h-9" />
          <CommandList>
            <CommandEmpty>No views found.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__default__" onSelect={handleReset} className="text-xs">
                <span className="flex-1 truncate">Default view</span>
                {currentViewId === null && <Check className="ml-2 size-3.5 shrink-0" />}
              </CommandItem>
            </CommandGroup>
            {views && views.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  {views.map((view) => {
                    const active = currentViewId === view.id;
                    return (
                      <CommandItem
                        key={view.id}
                        value={`view:${view.id}:${view.name}`}
                        onSelect={() => handlePick(view)}
                        className="group text-xs"
                      >
                        <span className="flex-1 truncate">{view.name}</span>
                        {active && <Check className="ml-2 size-3.5 shrink-0" />}
                        <button
                          type="button"
                          aria-label={`Delete ${view.name}`}
                          onClick={(e) => handleDelete(view, e)}
                          className={cn(
                            "ml-2 inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity",
                            "hover:bg-muted hover:text-destructive group-hover:opacity-100 focus:opacity-100"
                          )}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
