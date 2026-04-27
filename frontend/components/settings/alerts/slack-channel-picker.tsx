"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { Hash, Loader2, X } from "lucide-react";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { type SlackChannel } from "@/lib/actions/slack";
import { cn } from "@/lib/utils";

export interface SlackChannelSelection {
  id: string;
  name: string;
}

interface SlackChannelPickerProps {
  channels: SlackChannel[] | undefined;
  isLoading: boolean;
  value: SlackChannelSelection[];
  onChange: (value: SlackChannelSelection[]) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  invalid?: boolean;
}

// Rank: exact match > prefix match > substring match; boost channels the bot is in.
const scoreChannel = (name: string, query: string, isMember: boolean): number => {
  const lowerName = name.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let score: number;
  if (!lowerQuery) {
    score = 10;
  } else if (lowerName === lowerQuery) {
    score = 1000;
  } else if (lowerName.startsWith(lowerQuery)) {
    score = 500;
  } else if (lowerName.includes(lowerQuery)) {
    score = 100;
  } else {
    return -1;
  }
  return score + (isMember ? 50 : 0);
};

const ROW_HEIGHT = 30;
const MAX_VISIBLE_ROWS = 8;

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
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedIds = useMemo(() => new Set(value.map((v) => v.id)), [value]);

  const filtered = useMemo(() => {
    if (!channels) return [];
    const scored: { channel: SlackChannel; score: number }[] = [];
    for (const channel of channels) {
      if (selectedIds.has(channel.id)) continue;
      const score = scoreChannel(channel.name, query, channel.isMember);
      if (score < 0) continue;
      scored.push({ channel, score });
    }
    scored.sort((a, b) => b.score - a.score || a.channel.name.localeCompare(b.channel.name));
    return scored.map((s) => s.channel);
  }, [channels, query, selectedIds]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query, filtered.length]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  useEffect(() => {
    if (!open || filtered.length === 0) return;
    virtualizer.scrollToIndex(highlightedIndex, { align: "auto" });
  }, [highlightedIndex, open, filtered.length, virtualizer]);

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
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!open) setOpen(true);
        setHighlightedIndex((prev) => Math.min(prev + 1, Math.max(0, filtered.length - 1)));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        if (filtered[highlightedIndex]) {
          e.preventDefault();
          addChannel(filtered[highlightedIndex]);
        }
        return;
      }
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key === "Backspace" && !query && value.length > 0) {
        e.preventDefault();
        removeChannel(value[value.length - 1].id);
      }
    },
    [addChannel, filtered, highlightedIndex, open, query, removeChannel, value]
  );

  const items = virtualizer.getVirtualItems();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          role="combobox"
          aria-expanded={open}
          aria-disabled={disabled}
          onClick={() => {
            if (disabled) return;
            setOpen(true);
            inputRef.current?.focus();
          }}
          className={cn(
            "flex flex-wrap items-center gap-1 min-h-7 w-full rounded-md border bg-background px-2 py-1 text-xs",
            "focus-within:outline-hidden focus-within:ring-1 focus-within:ring-ring",
            disabled && "opacity-50 cursor-not-allowed",
            invalid && "border-destructive",
            className
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
            <input
              ref={inputRef}
              type="text"
              value={query}
              disabled={disabled}
              onChange={(e) => {
                setQuery(e.target.value);
                if (!open) setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={handleInputKeyDown}
              placeholder={value.length === 0 ? placeholder : ""}
              className="flex-1 min-w-0 bg-transparent outline-none placeholder:text-muted-foreground"
            />
            {isLoading && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
          </div>
        </div>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="p-0 w-[var(--radix-popover-trigger-width)]"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onWheel={(e) => e.stopPropagation()}
      >
        {isLoading ? (
          <div className="p-3 text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="size-3 animate-spin" />
            Loading channels...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground text-center">
            {query ? "No channels match your search." : "No channels available."}
          </div>
        ) : (
          <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: ROW_HEIGHT * MAX_VISIBLE_ROWS }}>
            <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
              {items.map((item) => {
                const channel = filtered[item.index];
                return (
                  <div
                    key={channel.id}
                    role="option"
                    aria-selected={item.index === highlightedIndex}
                    onMouseEnter={() => setHighlightedIndex(item.index)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      addChannel(channel);
                    }}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${item.size}px`,
                      transform: `translateY(${item.start}px)`,
                    }}
                    className={cn(
                      "flex items-center gap-2 px-2 text-xs cursor-pointer select-none",
                      item.index === highlightedIndex && "bg-accent text-accent-foreground"
                    )}
                  >
                    <Hash className="size-3 shrink-0 text-muted-foreground" />
                    <span className="truncate flex-1">{channel.name}</span>
                    {channel.isMember && <span className="text-[10px] text-muted-foreground shrink-0">member</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default SlackChannelPicker;
