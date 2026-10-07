"use client";

import { json } from "@codemirror/lang-json";
import CodeMirror from "@uiw/react-codemirror";
import { useParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { theme } from "@/components/ui/content-renderer/utils";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";

import { useQueueStore } from "../queue-store";

interface SchemaDefinitionDialogProps {
  /**
   * Optional controlled `open`. When provided, the dialog renders in
   * controlled mode and the parent owns the toggle state. The component
   * exposes its default trigger (the "Define / Edit annotation schema"
   * button in the panel header) as well, so passing `open` lets a
   * second trigger (e.g. the empty-state CTA in the Form tab) drive
   * the same dialog without rendering two separate dialog instances.
   */
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  /**
   * When false, the default header trigger button is omitted. The parent
   * is then responsible for rendering its own trigger that toggles `open`.
   * Useful when the panel header already has its own controls and we only
   * want the dialog body wired up via the empty-state CTA.
   */
  showTrigger?: boolean;
}

const exampleSchema = {
  type: "object",
  properties: {
    exampleInteger: {
      type: "integer",
      minimum: 1,
      maximum: 30,
      description: "Test integer field",
    },
    exampleEnum: {
      enum: ["enum1", "enum2", "enum3"],
      description: "Test enum field",
    },
    exampleBoolean: {
      type: "boolean",
      description: "Test boolean field",
    },
    exampleString: {
      type: "string",
      description: "Test string field",
    },
  },
  required: ["exampleInteger", "exampleEnum", "exampleBoolean", "exampleString"],
};

export default function SchemaDefinitionDialog({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  showTrigger = true,
}: SchemaDefinitionDialogProps = {}) {
  const { projectId } = useParams();
  const { toast } = useToast();
  const { annotationSchema, setAnnotationSchema, queue } = useQueueStore((state) => ({
    annotationSchema: state.annotationSchema,
    setAnnotationSchema: state.setAnnotationSchema,
    queue: state.queue,
  }));

  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen ?? internalOpen;
  const setIsOpen = (next: boolean) => {
    if (controlledOnOpenChange) controlledOnOpenChange(next);
    if (controlledOpen === undefined) setInternalOpen(next);
  };
  const [tempSchema, setTempSchema] = useState(annotationSchema ? JSON.stringify(annotationSchema, null, 2) : "");
  const [isValid, setIsValid] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!isValid || !queue) return;

    setIsSaving(true);
    try {
      const parsedSchema = tempSchema.trim() ? JSON.parse(tempSchema) : null;

      const response = await fetch(`/api/projects/${projectId}/queues/${queue.id}/annotation-schema`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          annotationSchema: parsedSchema,
        }),
      });

      if (!response.ok) {
        const errMessage = await response
          .json()
          .then((d) => d?.error)
          .catch(() => null);
        throw new Error(errMessage ?? "Failed to save annotation schema");
      }

      setAnnotationSchema(parsedSchema);
      if (parsedSchema !== null) {
        const fieldsCount =
          typeof parsedSchema.properties === "object" && parsedSchema.properties !== null
            ? Object.keys(parsedSchema.properties).length
            : 0;
        track("labeling_queues", "annotation_schema_saved", { fieldsCount });
      } else {
        track("labeling_queues", "annotation_schema_cleared");
      }
      setIsOpen(false);
      toast({
        title: "Success",
        description: "Annotation schema saved",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save annotation schema.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const insertExample = () => {
    setTempSchema(JSON.stringify(exampleSchema, null, 2));
    setIsValid(true);
  };

  const handleSchemaChange = (value: string) => {
    setTempSchema(value);
    try {
      const trimmed = value.trim();
      if (trimmed === "") {
        setIsValid(true);
        return;
      }

      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null && parsed.type === "object" && parsed.properties) {
        setIsValid(true);
      } else {
        setIsValid(false);
      }
    } catch {
      setIsValid(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open) {
          setTempSchema(annotationSchema ? JSON.stringify(annotationSchema, null, 2) : "");
          setIsValid(true);
        }
      }}
    >
      {showTrigger && (
        <DialogTrigger asChild>
          <Button className="outline-0" variant="secondary" icon="settings">
            Annotation schema
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="h-[80vh] overflow-hidden max-w-[60vw]">
        <DialogTitle className="hidden invisible" />
        <div className="flex flex-1 flex-col gap-4 overflow-hidden">
          <span className="text-lg font-medium">Define Annotation Schema</span>
          <p className="text-xs text-muted-foreground">
            Define a JSON Schema to render interactive target fields. Maximum 9 fields supported.
            <br />
            Supported types: string, integer/number (with min/max), boolean, enum
          </p>
          <Separator />
          <div className="flex h-full border rounded-md bg-muted/50 overflow-auto">
            <CodeMirror
              className="h-full w-full"
              placeholder="Enter JSON Schema"
              value={tempSchema}
              onChange={handleSchemaChange}
              extensions={[json()]}
              theme={theme}
            />
          </div>
          {!isValid && (
            <p className="text-xs text-destructive">
              Please enter a valid JSON Schema with type: &#34;object&#34; and properties
            </p>
          )}
          <div className="flex justify-between items-center">
            <Button variant="outline" onClick={insertExample}>
              Insert Example
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!isValid || isSaving}>
                {isSaving ? "Saving..." : "Save Schema"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
