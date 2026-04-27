"use client";

import { Command as CommandPrimitive } from "cmdk";
import { Hash, Loader2, X } from "lucide-react";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { type SlackChannel } from "@/lib/actions/slack";
import { cn } from "@/lib/utils";

export interface SlackChannelSelection {
  id: string;
  name: string;
}

interface SlackChannelPickerProps {
  channels?: SlackChannel[];
  isLoading: boolean;
  value: SlackChannelSelection[];
  onChange: (value: SlackChannelSelection[]) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  invalid?: boolean;
}

const SlackChannelPicker = ({
  channels,
  isLoading,
  value,
  onChange,
  disabled,
  placeholder = "Select channels",
  className,
  invalid,
}: SlackChannelPickerProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedIds = useMemo(() => new Set(value.map((v) => v.id)), [value]);

  // Drop already-selected channels and put member channels first; cmdk handles
  // the rest of the search/ranking as the user types.
  const options = useMemo(() => {
    if (!channels) return [];
    return channels
      .filter((c) => !selectedIds.has(c.id))
      .sort((a, b) => {
        if (a.isMember !== b.isMember) return a.isMember ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [channels, selectedIds]);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const addChannel = useCallback(
    (channel: SlackChannel) => {
      if (selectedIds.has(channel.id)) return;
      onChange([...value, { id: channel.id, name: channel.name }]);
      setQuery("");
      inputRef.current?.focus();
    },
    [onChange, selectedIds, value]
  );

  const removeChannel = useCallback(
    (id: string) => {
      onChange(value.filter((v) => v.id !== id));
    },
    [onChange, value]
  );

  const handleInputKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key === "Backspace" && !query && value.length > 0) {
        e.preventDefault();
        removeChannel(value[value.length - 1].id);
      }
    },
    [query, removeChannel, value]
  );

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <Command
        className="overflow-visible bg-transparent"
        // cmdk's default filter scores against `value` (channel id) AND keywords;
        // we only want to match against the channel name in `keywords`.
        filter={(_, search, keywords) => {
          const name = (keywords?.[0] ?? "").toLowerCase();
          const q = search.toLowerCase();
          if (!q) return 1;
          if (name === q) return 1;
          if (name.startsWith(q)) return 0.9;
          if (name.includes(q)) return 0.5;
          return 0;
        }}
      >
        <div
          onClick={() => {
            if (disabled) return;
            setOpen(true);
            inputRef.current?.focus();
          }}
          className={cn(
            "flex flex-wrap items-center gap-1 min-h-7 w-full rounded-md border bg-background px-2 py-1 text-xs",
            "focus-within:outline-hidden focus-within:ring-1 focus-within:ring-ring",
            disabled && "opacity-50 cursor-not-allowed",
            invalid && "border-destructive"
          )}
        >
          {value.map((v) => (
            <span
              key={v.id}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-secondary-foreground"
            >
              <Hash className="size-3" />
              <span className="truncate max-w-40">{v.name}</span>
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  removeChannel(v.id);
                }}
                className="hover:text-foreground"
                aria-label={`Remove ${v.name}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <div className="flex items-center gap-1 flex-1 min-w-24">
            <CommandPrimitive.Input
              ref={inputRef}
              value={query}
              onValueChange={(v) => {
                setQuery(v);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={handleInputKeyDown}
              disabled={disabled}
              placeholder={value.length === 0 ? placeholder : ""}
              className="flex-1 min-w-0 bg-transparent outline-none placeholder:text-muted-foreground"
            />
            {isLoading && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
          </div>
        </div>

        {open && (
          <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-md border bg-popover text-popover-foreground shadow-md">
            {isLoading ? (
              <div className="p-3 text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="size-3 animate-spin" />
                Loading channels...
              </div>
            ) : (
              <CommandList className="max-h-60">
                <CommandEmpty className="p-3 text-xs text-muted-foreground text-center">
                  {query ? "No channels match your search." : "No channels available."}
                </CommandEmpty>
                {options.length > 0 && (
                  <CommandGroup>
                    {options.map((channel) => (
                      <CommandItem
                        key={channel.id}
                        value={channel.id}
                        keywords={[channel.name]}
                        onSelect={() => addChannel(channel)}
                        className="text-xs"
                      >
                        <Hash className="size-3 shrink-0 text-muted-foreground" />
                        <span className="truncate flex-1">{channel.name}</span>
                        {channel.isMember && <span className="text-[10px] text-muted-foreground shrink-0">member</span>}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            )}
          </div>
        )}
      </Command>
    </div>
  );
};

export default SlackChannelPicker;
