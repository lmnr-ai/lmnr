import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const PANELS = ["trace", "files"] as const;
export type Panel = (typeof PANELS)[number];

interface PanelToggleProps {
  value: Panel;
  onChange: (panel: Panel) => void;
}

/** Switches the trial panel between its trace and its task's files. */
export default function PanelToggle({ value, onChange }: PanelToggleProps) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as Panel)}>
      <TabsList size="sm">
        <TabsTrigger value="trace">Trace</TabsTrigger>
        <TabsTrigger value="files">Files</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
