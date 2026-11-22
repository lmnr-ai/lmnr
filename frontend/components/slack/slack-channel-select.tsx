"use client";

import { Check, ChevronsUpDown, Hash, Loader2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { compareSlackChannels, filterSlackChannelByName } from "@/components/settings/alerts/slack-channel-picker";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { SlackChannel } from "@/lib/actions/slack";
import { cn } from "@/lib/utils";

interface SlackChannelSelectProps {
  channels: SlackChannel[];
  isLoading: boolean;
  value: string;
  onChange: (channelId: string) => void;
  className?: string;
}

// Searchable single-channel select: workspaces with hundreds of channels can't scroll a plain Select.
export default function SlackChannelSelect({
  channels,
  isLoading,
  value,
  onChange,
  className,
}: SlackChannelSelectProps) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const options = useMemo(() => [...channels].sort(compareSlackChannels), [channels]);
  const selected = useMemo(() => channels.find((c) => c.id === value), [channels, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={isLoading}
          className={cn(
            "flex h-8 w-full items-center justify-between gap-1 whitespace-nowrap rounded-md border bg-transparent px-2 text-xs",
            "focus:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {isLoading ? "Loading channels…" : selected ? `#${selected.name}` : "Select a channel"}
          </span>
          {isLoading ? (
            <Loader2 className="size-3 shrink-0 animate-spin opacity-50" />
          ) : (
            <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="p-0 w-(--radix-popover-trigger-width) min-w-64"
        onWheel={(e) => e.stopPropagation()}
      >
        <Command filter={filterSlackChannelByName}>
          <CommandInput
            placeholder="Search channels..."
            className="h-8 text-xs"
            // cmdk keeps the list's scroll offset across searches, hiding the top matches.
            onValueChange={() => requestAnimationFrame(() => listRef.current?.scrollTo({ top: 0 }))}
          />
          <CommandList ref={listRef} className="max-h-60">
            <CommandEmpty className="p-3 text-xs text-muted-foreground text-center">No channels found.</CommandEmpty>
            <CommandGroup>
              {options.map((channel) => (
                <CommandItem
                  key={channel.id}
                  value={channel.id}
                  keywords={[channel.name]}
                  onSelect={() => {
                    onChange(channel.id);
                    setOpen(false);
                  }}
                  className="text-xs"
                >
                  <Hash className="size-3 shrink-0 text-muted-foreground" />
                  <span className="truncate flex-1">{channel.name}</span>
                  {channel.isMember && <span className="text-[10px] text-muted-foreground shrink-0">member</span>}
                  <Check className={cn("size-3 shrink-0", channel.id === value ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
