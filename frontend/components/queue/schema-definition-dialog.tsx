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

import { useQueueStore } from "./queue-store";

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

export default function SchemaDefinitionDialog() {
  const { projectId } = useParams();
  const { toast } = useToast();
  const { annotationSchema, setAnnotationSchema, queue } = useQueueStore((state) => ({
    annotationSchema: state.annotationSchema,
    setAnnotationSchema: state.setAnnotationSchema,
    queue: state.queue,
  }));

  const [isOpen, setIsOpen] = useState(false);
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
        throw new Error("Failed to save annotation schema");
      }

      setAnnotationSchema(parsedSchema);
      setIsOpen(false);
      toast({
        title: "Success",
        description: "Annotation schema saved successfully",
      });
    } catch (error) {
      console.error("Error saving annotation schema:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save annotation schema. Please try again.",
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
      // Basic validation - check if it's an object with properties
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
          // Reset tempSchema when opening dialog
          setTempSchema(annotationSchema ? JSON.stringify(annotationSchema, null, 2) : "");
          setIsValid(true);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outlinePrimary" icon="braces">
          Define target schema
        </Button>
      </DialogTrigger>
      <DialogContent className="h-[80vh] overflow-hidden max-w-[60vw]">
        <DialogTitle className="hidden invisible" />
        <div className="flex flex-1 flex-col gap-4 overflow-hidden">
          <span className="text-lg font-medium">Define Annotation Schema</span>
          <p className="text-xs text-muted-foreground">
            Define a JSON Schema to create interactive annotation buttons. Maximum 9 fields supported.
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
