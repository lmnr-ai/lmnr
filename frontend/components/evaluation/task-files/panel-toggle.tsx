import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const PANELS = ["trace", "task", "log"] as const;
export type Panel = (typeof PANELS)[number];

interface PanelToggleProps {
  value: Panel;
  onChange: (panel: Panel) => void;
  /** Only remote runs upload Harbor job output. */
  showLog: boolean;
}

/** Switches the trial panel between its trace, its task's files and its Harbor trial output. */
export default function PanelToggle({ value, onChange, showLog }: PanelToggleProps) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as Panel)}>
      <TabsList size="sm">
        <TabsTrigger value="trace">Trace</TabsTrigger>
        <TabsTrigger value="task">Task</TabsTrigger>
        {showLog && <TabsTrigger value="log">Log</TabsTrigger>}
      </TabsList>
    </Tabs>
  );
}
