"use client";

import { get } from "lodash";
import { Braces, Loader2, Sparkles } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import ContentRenderer from "@/components/ui/content-renderer/index";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { useQueueStore } from "../queue-store";
import AnnotationInterface from "./annotation-interface";
import ApprovalStatus from "./approval-status";
import SchemaDefinitionDialog from "./schema-definition-dialog";

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
  const isApproved = currentItem?.isLabelled ?? false;
  const showOverlay = ioState === "save" || ioState === "remove" || ioState === "push-one";

  const targetValue = useMemo(
    () => JSON.stringify(get(currentItem?.payload, "target", {}), null, 2),
    [currentItem?.payload]
  );

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
    <div
      className={cn(
        "flex flex-col border rounded-lg overflow-hidden bg-secondary transition-colors",
        isApproved && "border-green-500/40 ring-1 ring-green-500/20"
      )}
    >
      <div className="flex px-3 py-2 border-b items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Target</span>
          <ApprovalStatus />
        </div>
        <SchemaDefinitionDialog open={schemaDialogOpen} onOpenChange={setSchemaDialogOpen} />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden relative">
        {showOverlay && (
          <div className="z-30 absolute inset-0 bg-background/30 backdrop-blur-xs flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        <Tabs defaultValue={hasSchema ? "form" : "data"} className="flex flex-1 flex-col gap-0 p-3">
          <TabsList className="self-start">
            <TabsTrigger value="data">Data</TabsTrigger>
            {/* Form tab is no longer disabled when no schema is defined —
                clicking it now reveals the empty state with a CTA, which is
                the only place the schema dialog feature is discoverable
                besides the header button. */}
            <TabsTrigger value="form">Form</TabsTrigger>
          </TabsList>
          <TabsContent value="data" className="flex flex-1 flex-col overflow-hidden pt-3">
            <span className="text-xs text-secondary-foreground mb-2">
              JSON written to the target key of the payload.
            </span>
            <div className="flex flex-1 overflow-hidden">
              <ContentRenderer
                presetKey={`labeling-queue-target-${queueId}`}
                codeEditorClassName="rounded-none"
                className={cn("rounded", !isTargetJsonValid && "border border-destructive/75")}
                defaultMode="json"
                value={targetValue}
                onChange={onTargetJsonChange}
              />
            </div>
          </TabsContent>
          <TabsContent value="form" className="flex flex-1 flex-col overflow-auto pt-3">
            {hasSchema ? <AnnotationInterface /> : <FormEmptyState onDefineSchema={() => setSchemaDialogOpen(true)} />}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/**
 * Empty state shown in the Form tab when no annotation schema is defined.
 * The previous behavior disabled the tab entirely, which made the schema
 * dialog feature undiscoverable to anyone who hadn't already noticed the
 * small button in the panel header. Surfacing the CTA here puts the
 * pathway one click away from the place users expect to find it.
 */
function FormEmptyState({ onDefineSchema }: { onDefineSchema: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 px-4 text-center border border-dashed rounded-md">
      <div className="flex items-center justify-center size-10 rounded-full bg-primary/10 text-primary">
        <Sparkles className="size-5" />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">Annotate with structured fields</span>
        <span className="text-xs text-secondary-foreground max-w-md">
          Define a JSON schema (string, number, boolean, enum) and Laminar will render an interactive form here with 1–9
          hotkey shortcuts for fast labelling.
        </span>
      </div>
      <Button variant="outline" onClick={onDefineSchema} className="mt-1">
        <Braces className="size-3.5 mr-1" />
        Define annotation schema
      </Button>
    </div>
  );
}
