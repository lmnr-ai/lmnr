"use client";

import { Switch } from "@/components/ui/switch";
import { useLocalStorage } from "@/hooks/use-local-storage.tsx";

/** Live-updates switch for a table; `storageKey` is the localStorage key its contents read too. */
export function RealtimeToggle({ storageKey }: { storageKey: string }) {
  const [realtimeEnabled, setRealtimeEnabled] = useLocalStorage(storageKey, false);

  return (
    <div className="flex items-center gap-2 px-2 border rounded-md bg-background h-7">
      <Switch id={storageKey} checked={realtimeEnabled} onCheckedChange={setRealtimeEnabled} />
      <label htmlFor={storageKey} className="text-xs cursor-pointer font-medium text-secondary-foreground">
        Realtime
      </label>
    </div>
  );
}
