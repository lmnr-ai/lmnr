"use client";

import { Switch } from "@/components/ui/switch";
import { useLocalStorage } from "@/hooks/use-local-storage.tsx";

export function TracesRealtimeToggle() {
  const [realtimeEnabled, setRealtimeEnabled] = useLocalStorage("traces-table:realtime", false);

  return (
    <div className="flex items-center gap-2 px-2 border rounded-md bg-background h-7">
      <Switch id="realtime" checked={realtimeEnabled} onCheckedChange={setRealtimeEnabled} />
      <span className="text-xs cursor-pointer font-medium text-secondary-foreground">Realtime</span>
    </div>
  );
}
