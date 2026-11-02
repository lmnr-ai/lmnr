import { useDashboardEditorStoreContext } from "@/components/dashboards/editor/dashboard-editor-store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ChartNameField = () => {
  const { name, setName } = useDashboardEditorStoreContext((state) => ({
    name: state.chart.name,
    setName: state.setName,
  }));

  return (
    <div className="grid gap-1">
      <Label className="font-semibold text-xs">Chart Name</Label>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter chart name..." />
    </div>
  );
};

export default ChartNameField;
