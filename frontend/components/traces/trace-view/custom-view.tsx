import {
  TemplatePickerActions,
  TemplatePickerPreview,
  TemplatePickerProvider,
  TemplatePickerView,
} from "@/components/ui/template-renderer/template-picker";

// Custom render-template view for a trace. Reuses the shared TemplatePicker
// infra (same as the content-renderer "custom" mode). For now NO trace data is
// fed into the template — it renders as a dummy with empty data; the data
// integration comes later.
export default function CustomView() {
  return (
    <TemplatePickerProvider presetKey="trace-custom" testData="">
      <div className="flex flex-col flex-1 h-full w-full overflow-hidden">
        <div className="flex items-center gap-1 px-2 py-1 border-b">
          <TemplatePickerView mode="custom" onModeChange={() => {}} modes={["custom"]} />
          <TemplatePickerActions />
        </div>
        <div className="flex-1 flex overflow-auto bg-muted/50 min-h-0">
          <TemplatePickerPreview data="" />
        </div>
      </div>
    </TemplatePickerProvider>
  );
}
