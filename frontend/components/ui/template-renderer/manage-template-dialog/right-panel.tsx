import { Sparkles } from "lucide-react";
import { useFormContext, useWatch } from "react-hook-form";

import { CopyButton } from "@/components/ui/copy-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildRenderTemplatePrompt, buildTraceRenderTemplatePrompt } from "@/lib/actions/render-template/prompts";

import { type ManageTemplateForm, type TemplateScope } from "../index";
import JsxRenderer from "../jsx-renderer";
import CodeEditor from "./code-editor";
import DataPanel from "./data-panel";
import SpanFilter from "./span-filter";

interface Props {
  scope: TemplateScope;
  traceId?: string;
  /** Span outline that enriches the copied AI prompt (trace scope only). */
  spanOutline?: unknown[];
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const RightPanel = ({ scope, traceId, spanOutline, activeTab, onTabChange }: Props) => {
  const { control } = useFormContext<ManageTemplateForm>();
  const code = useWatch({ control, name: "code" });
  const testData = useWatch({ control, name: "testData" });

  const copyPromptText =
    scope === "trace"
      ? buildTraceRenderTemplatePrompt(spanOutline ? JSON.stringify(spanOutline, null, 2) : undefined)
      : buildRenderTemplatePrompt(testData);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col gap-4 px-5 pb-4 pt-4">
      <Tabs value={activeTab} onValueChange={onTabChange} className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
        <TabsList className="self-start">
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="data">Sample data</TabsTrigger>
          <TabsTrigger value="code">Code</TabsTrigger>
        </TabsList>

        <TabsContent
          value="preview"
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-background outline-none"
        >
          <JsxRenderer code={code} data={testData} />
        </TabsContent>

        {/* Sample data owns both the trace-scope span filter (which populates the
            data) and the JSON editor that the preview renders from. */}
        <TabsContent value="data" className="flex min-h-0 flex-1 flex-col gap-4 outline-none">
          {scope === "trace" && <SpanFilter traceId={traceId} />}
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            <DataPanel />
          </div>
        </TabsContent>

        <TabsContent value="code" className="flex min-h-0 flex-1 flex-col gap-3 outline-none">
          <div className="flex shrink-0 items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2">
            <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="size-3.5 shrink-0 text-primary" />
              <span>Generate with your AI tool and paste here</span>
            </div>
            <CopyButton
              type="button"
              variant="secondaryLight"
              text={copyPromptText}
              className="shrink-0 text-xs"
              iconClassName="size-3"
            >
              Copy prompt
            </CopyButton>
          </div>
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-md border border-border">
            <CodeEditor />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RightPanel;
