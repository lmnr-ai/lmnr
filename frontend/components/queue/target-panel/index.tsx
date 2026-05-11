"use client";

import { Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { Braces, Loader2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import SchemaDefinitionDialog from "@/components/queue/target-panel/schema-definition-dialog.tsx";
import { Button } from "@/components/ui/button";
import ContentRenderer from "@/components/ui/content-renderer/index";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { getEffectiveTarget, useQueueStore } from "../queue-store";
import AnnotationInterface from "./annotation-interface";
import ApprovalStatus from "./approval-status";

const SUPPRESS_MOD_ENTER = [Prec.highest(keymap.of([{ key: "Mod-Enter", run: () => true, preventDefault: true }]))];

export default function TargetPanel() {
  const queueId = useQueueStore((s) => s.queue.id);
  const ioState = useQueueStore((s) => s.ioState);
  const currentItem = useQueueStore((s) => s.getCurrentItem());
  const isTargetJsonValid = useQueueStore((s) => s.isTargetJsonValid);
  const fields = useQueueStore((s) => s.fields);
  const annotationSchema = useQueueStore((s) => s.annotationSchema);
  const setTarget = useQueueStore((s) => s.setTarget);
  const setTargetJsonValid = useQueueStore((s) => s.setTargetJsonValid);

  // Dialog state lifted here so both the header trigger and the in-tab
  // empty-state CTA drive the same dialog instance without rendering two.
  const [schemaDialogOpen, setSchemaDialogOpen] = useState(false);

  const hasSchema = !!annotationSchema && fields.length > 0;
  const showOverlay = ioState === "save" || ioState === "remove" || ioState === "push-one";

  const targetValue = useMemo(() => JSON.stringify(getEffectiveTarget(currentItem), null, 2), [currentItem]);

  const onTargetJsonChange = useCallback(
    (v: string) => {
      try {
        const parsed = JSON.parse(v);
        setTargetJsonValid(true);
        setTarget(parsed);
      } catch {
        setTargetJsonValid(false);
      }
    },
    [setTarget, setTargetJsonValid]
  );

  return (
    <div className={cn("flex flex-col h-full border rounded-lg overflow-hidden bg-secondary transition-colors")}>
      <div className="flex min-h-[39px] p-2 border-b items-center justify-between">
        <div className="flex items-center gap-2 truncate">
          <span className="text-sm font-medium">Target</span>
          <ApprovalStatus />
        </div>
      </div>
      <div className="flex flex-1 flex-col overflow-hidden relative">
        {showOverlay && (
          <div className="z-30 absolute inset-0 bg-background/30 backdrop-blur-xs flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        <Tabs defaultValue={hasSchema ? "form" : "data"} className="flex flex-1 flex-col gap-0 min-h-0">
          <div className="flex items-center justify-between px-2 pt-2">
            <TabsList className="self-start">
              <TabsTrigger value="data">Data</TabsTrigger>
              <TabsTrigger value="form">Form</TabsTrigger>
            </TabsList>
            <SchemaDefinitionDialog open={schemaDialogOpen} onOpenChange={setSchemaDialogOpen} />
          </div>
          <TabsContent value="data" className="flex flex-1 flex-col overflow-hidden min-h-0 p-2">
            <span className="text-xs text-secondary-foreground mb-2">
              JSON written to the target key of the payload.
            </span>
            <div className="flex flex-1 overflow-hidden min-h-0">
              <ContentRenderer
                presetKey={`labeling-queue-target-${queueId}`}
                codeEditorClassName="rounded-none"
                className={cn("rounded", !isTargetJsonValid && "border border-destructive/75")}
                defaultMode="json"
                value={targetValue}
                onChange={onTargetJsonChange}
                extraExtensions={SUPPRESS_MOD_ENTER}
              />
            </div>
          </TabsContent>
          <TabsContent value="form" className="flex flex-1 flex-col min-h-0">
            <ScrollArea className="p-2">
              {hasSchema ? (
                <AnnotationInterface />
              ) : (
                <FormEmptyState onDefineSchema={() => setSchemaDialogOpen(true)} />
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function FormEmptyState({ onDefineSchema }: { onDefineSchema: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 px-4 text-center border border-dashed rounded-md">
      <div className="flex items-center justify-center size-10 rounded-full bg-primary/10 text-primary">
        <Braces className="size-5" />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">Annotate with structured fields</span>
        <span className="text-xs text-secondary-foreground max-w-md">
          Define a JSON schema (string, number, boolean, enum) and Laminar will render an interactive form here with 1–9
          hotkey shortcuts for fast labelling.
        </span>
      </div>
      <Button variant="secondary" onClick={onDefineSchema} className="mt-1">
        Define schema
      </Button>
    </div>
  );
}
