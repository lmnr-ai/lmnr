import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const PANELS = ["trace", "task", "log", "scripts"] as const;
export type Panel = (typeof PANELS)[number];

interface PanelToggleProps {
  value: Panel;
  onChange: (panel: Panel) => void;
  showTask: boolean;
  /** Only remote runs upload Harbor job output. */
  showLog: boolean;
  showScripts: boolean;
}

/** Switches the trial panel between its trace, its task's files, its Harbor trial output and the run's scripts. */
export default function PanelToggle({ value, onChange, showTask, showLog, showScripts }: PanelToggleProps) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as Panel)}>
      <TabsList size="sm">
        <TabsTrigger value="trace">Trace</TabsTrigger>
        {showTask && <TabsTrigger value="task">Task</TabsTrigger>}
        {showLog && <TabsTrigger value="log">Log</TabsTrigger>}
        {showScripts && <TabsTrigger value="scripts">Scripts</TabsTrigger>}
      </TabsList>
    </Tabs>
  );
}
