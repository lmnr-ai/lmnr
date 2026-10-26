import { type DisplayMode, resolveDisplayMode } from "@/components/chart-builder/types";
import { useDashboardEditorStoreContext } from "@/components/dashboards/editor/dashboard-editor-store";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const DisplayValueField = () => {
  const { displayMode, setDisplayMode } = useDashboardEditorStoreContext((state) => ({
    displayMode: resolveDisplayMode(state.chart.settings.config),
    setDisplayMode: state.setDisplayMode,
  }));

  return (
    <div className="grid gap-1">
      <Label className="font-semibold text-xs">Display Value</Label>
      <Select value={displayMode} onValueChange={(value) => setDisplayMode(value as DisplayMode)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">None</SelectItem>
          <SelectItem value="total">Total</SelectItem>
          <SelectItem value="average">Average</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};

export default DisplayValueField;
