"use client";

import { debounce } from "lodash";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";

const SEARCH_DEBOUNCE_MS = 300;

/** Narrows the tasks by name; the table refetches only once typing pauses. */
export default function TasksTableControls({ onSearchChange }: { onSearchChange: (search: string) => void }) {
  const [value, setValue] = useState("");
  const emit = useMemo(
    () => debounce((next: string) => onSearchChange(next.trim()), SEARCH_DEBOUNCE_MS),
    [onSearchChange]
  );
  useEffect(() => () => emit.cancel(), [emit]);

  return (
    <div className="relative w-full">
      <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          emit(event.target.value);
        }}
        placeholder="Search tasks…"
        className="h-7 pl-7 text-xs"
      />
    </div>
  );
}
