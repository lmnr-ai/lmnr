import { Database, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";

import { Badge } from "@/components/ui/badge";
import { useProjectContext } from "@/contexts/project-context";
import { Dataset } from "@/lib/dataset/types";
import { eventEmitter } from "@/lib/event-emitter";
import { useToast } from "@/lib/hooks/use-toast";
import {
  ChatMessage,
  ChatMessageContentPart,
  ChatMessageImage,
  ChatMessageImageUrl,
  ChatMessageContent,
  flattenContentOfMessages,
} from "@/lib/types";
import { Span } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

import { Button } from "../ui/button";
import DatasetSelect from "../ui/dataset-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import Formatter from "../ui/formatter";
import { Label } from "../ui/label";
import { isString } from "lodash";

interface ExportSpansDialogProps {
  span: Span;
}

export default function ExportSpansDialog({ span }: ExportSpansDialogProps) {
  const { projectId } = useProjectContext();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);

  const { toast } = useToast();

  const [data, setData] = useState<ChatMessage[] | any>({});
  const [target, setTarget] = useState(span.output);
  const [isDataValid, setIsDataValid] = useState(true);
  const [isTargetValid, setIsTargetValid] = useState(true);

  const [metadata, setMetadata] = useState({ spanId: span.spanId });
  const [isMetadataValid, setIsMetadataValid] = useState(true);

  useEffect(() => {
    const processInput = async () => {
      if (span && span.input !== undefined && span.input !== null) {
        let spanInput: any = span.input;

        if (!Array.isArray(spanInput)) {
          setData(spanInput);
          setIsDataValid(true);
          return;
        }

        // if data is an array most likely it's a list of ChatMessages
        const initialMessages = spanInput as ChatMessage[];

        const processedMessages = await Promise.all(
          initialMessages.map(async (message) => {
            if (isString(message.content)) {
              return message;
            }
            const newContentParts = await Promise.all(
              message.content.map(async (part) => {
                if (part.type === "image_url" && (part as ChatMessageImageUrl).url) {
                  const imageUrlPart = part as ChatMessageImageUrl;
                  try {
                    const response = await fetch(imageUrlPart.url);
                    if (!response.ok) {
                      console.error(
                        `Failed to download image: ${imageUrlPart.url}, status: ${response.status}`
                      );
                      return imageUrlPart;
                    }
                    const blob = await response.blob();
                    let mediaType = blob.type || "application/octet-stream"; // Initial mediaType from blob

                    const base64DataUrl = await new Promise<string>((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onloadend = () => resolve(reader.result as string);
                      reader.onerror = reject;
                      reader.readAsDataURL(blob);
                    });
                    const base64StringParts = base64DataUrl.split(",");
                    const base64String =
                      base64StringParts.length > 1 ? base64StringParts[1] : null;

                    if (!base64String) {
                      console.error(
                        `Failed to convert image to base64: ${imageUrlPart.url}`
                      );
                      return imageUrlPart;
                    }

                    // Infer mediaType from base64 string
                    if (base64String.startsWith("/9j/")) {
                      mediaType = "image/jpeg";
                    } else if (base64String.startsWith("iVBORw0KGgo")) {
                      mediaType = "image/png";
                    } else if (blob.type && blob.type !== "application/octet-stream") {
                      // Fallback to blob.type if it's specific
                      mediaType = blob.type;
                    } else {
                      // Final fallback
                      mediaType = "application/octet-stream";
                    }

                    return {
                      type: "image",
                      mediaType: mediaType,
                      data: base64String,
                    } as ChatMessageImage;
                  } catch (error) {
                    console.error(
                      `Error processing image_url ${imageUrlPart.url}:`,
                      error
                    );
                    return imageUrlPart;
                  }
                }
                return part;
              })
            );
            return { ...message, content: newContentParts };
          })
        );
        setData(processedMessages);
        setIsDataValid(true);
      } else {
        setData([]);
        setIsDataValid(true);
      }
    };

    processInput();
  }, [span.input]);

  const handleDataChange = (value: string) => {
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) {
        setIsDataValid(false);
        return;
      }
      setData(parsed as ChatMessage[]);
      setIsDataValid(true);
    } catch (e) {
      setIsDataValid(false);
    }
  };

  const handleTargetChange = (value: string) => {
    try {
      setTarget(JSON.parse(value));
      setIsTargetValid(true);
    } catch (e) {
      setIsTargetValid(false);
    }
  };

  const handleMetadataChange = (value: string) => {
    try {
      setMetadata(JSON.parse(value));
      setIsMetadataValid(true);
    } catch (e) {
      setIsMetadataValid(false);
    }
  };

  const exportSpan = async () => {
    if (!selectedDataset) {
      return;
    }
    setIsLoading(true);
    const res = await fetch(`/api/projects/${projectId}/datasets/${selectedDataset.id}/datapoints`, {
      method: "POST",
      body: JSON.stringify({
        datapoints: [
          {
            data: data,
            target: target,
            metadata: metadata,
          },
        ],
        sourceSpanId: span.spanId,
      }),
    });
    setIsLoading(false);
    setIsDialogOpen(false);
    if (!res.ok) {
      toast({
        title: "Failed to export span",
        variant: "destructive",
      });
    } else {
      eventEmitter.emit("mutateSpanDatapoints");
      toast({
        title: `Successfully exported span to dataset ${selectedDataset?.name}`,
      });
    }
  };

  return (
    <>
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setSelectedDataset(null);
            setIsLoading(false);
          }
        }}
      >
        <DialogTrigger asChild>
          <Badge className="cursor-pointer" variant="secondary">
            <Database className="size-3 mr-2" />
            <span className="text-xs">Add to dataset</span>
          </Badge>
        </DialogTrigger>
        <DialogContent className="max-w-6xl bg-background max-h-[90vh] p-0 m-0 gap-0">
          <DialogHeader className="p-4 border-b m-0">
            <div className="flex flex-row justify-between items-center">
              <DialogTitle>Export span to dataset</DialogTitle>
              <Button
                onClick={async () => await exportSpan()}
                disabled={isLoading || !selectedDataset || !isDataValid || !isTargetValid || !isMetadataValid}
              >
                <Loader2 className={cn("mr-2 hidden", isLoading ? "animate-spin block" : "")} size={16} />
                Add to dataset
              </Button>
            </div>
          </DialogHeader>
          <div className="flex flex-col space-y-8 overflow-auto flex-grow h-[70vh] m-0">
            <div className="flex flex-col space-y-4 p-4 pb-8">
              <div className="flex flex-none flex-col space-y-2">
                <Label className="text-lg font-medium">Dataset</Label>
                <DatasetSelect onChange={(dataset) => setSelectedDataset(dataset)} />
              </div>
              <div className="flex flex-col space-y-2">
                <Label className="text-lg font-medium">Data</Label>
                <Formatter
                  className="max-h-[500px]"
                  editable
                  defaultMode={"json"}
                  value={JSON.stringify(data, null, 2)}
                  onChange={handleDataChange}
                />
                {!isDataValid && (
                  <p className="text-sm text-red-500">
                    Data must be a valid JSON array of ChatMessages.
                  </p>
                )}
              </div>
              <div className="flex flex-col space-y-2">
                <Label className="text-lg font-medium">Target</Label>
                <Formatter
                  className="max-h-[500px]"
                  editable
                  defaultMode={"json"}
                  value={JSON.stringify(target, null, 2)}
                  onChange={handleTargetChange}
                />
                {!isTargetValid && <p className="text-sm text-red-500">Invalid JSON format</p>}
              </div>
              <div className="flex flex-col space-y-2">
                <Label className="text-lg font-medium">Metadata</Label>
                <Formatter
                  className="max-h-[500px]"
                  editable
                  defaultMode={"json"}
                  value={JSON.stringify(metadata, null, 2)}
                  onChange={handleMetadataChange}
                />
                {!isMetadataValid && <p className="text-sm text-red-500">Invalid JSON format</p>}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
