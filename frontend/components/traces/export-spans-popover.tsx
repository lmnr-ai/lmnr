import { isString } from "lodash";
import { Database, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PropsWithChildren, useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dataset } from "@/lib/dataset/types";
import { useToast } from "@/lib/hooks/use-toast";
import { Span } from "@/lib/traces/types";
import { ChatMessage, ChatMessageImage, ChatMessageImageUrl } from "@/lib/types";

import DatasetSelect from "../ui/dataset-select";

interface ExportSpansDialogProps {
  span: Span;
}

export default function ExportSpansPopover({ children, span }: PropsWithChildren<ExportSpansDialogProps>) {
  const { projectId } = useParams();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);

  const { toast } = useToast();

  const [data, setData] = useState<{
    data: ChatMessage[] | any;
    target: Record<string, unknown>;
    metadata: Record<string, unknown>;
  }>({
    data: span.input,
    target: span.output,
    metadata: { spanId: span.spanId },
  });

  useEffect(() => {
    const processInput = async () => {
      if (span && span.input !== undefined && span.input !== null) {
        let spanInput: any = span.input;

        if (!Array.isArray(spanInput)) {
          setData((prev) => ({ ...prev, data: spanInput }));
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
                      console.error(`Failed to download image: ${imageUrlPart.url}, status: ${response.status}`);
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
                    const base64String = base64StringParts.length > 1 ? base64StringParts[1] : null;

                    if (!base64String) {
                      console.error(`Failed to convert image to base64: ${imageUrlPart.url}`);
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
                    console.error(`Error processing image_url ${imageUrlPart.url}:`, error);
                    return imageUrlPart;
                  }
                }
                return part;
              })
            );
            return { ...message, content: newContentParts };
          })
        );
        setData((prev) => ({ ...prev, data: processedMessages }));
      } else {
        setData((prev) => ({ ...prev, data: [] }));
      }
    };

    processInput();
  }, [span, span.input]);

  const exportSpan = useCallback(async () => {
    try {
      if (!selectedDataset) {
        return;
      }
      setIsLoading(true);
      const res = await fetch(`/api/projects/${projectId}/datasets/${selectedDataset.id}/datapoints`, {
        method: "POST",
        body: JSON.stringify({
          datapoints: [data],
          sourceSpanId: span.spanId,
        }),
      });
      if (!res.ok) {
        toast({
          title: "Failed to export span. Please try again.",
          variant: "destructive",
        });
      } else {
        const datapoint = await res.json();

        toast({
          title: `Added span to dataset`,
          description: (
            <span>
              Successfully added to dataset.{" "}
              <Link
                className="text-primary"
                href={`/project/${projectId}/datasets/${selectedDataset.id}?datapointId=${datapoint.id}`}
              >
                Go to dataset.
              </Link>
            </span>
          ),
        });
      }
      setOpen(false);
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "Failed to export span. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [data, projectId, selectedDataset, span.spanId, toast]);

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(open) => {
          setOpen(open);
          if (!open) {
            setSelectedDataset(null);
            setIsLoading(false);
          }
        }}
      >
        <PopoverTrigger asChild>
          {children || (
            <Badge className="cursor-pointer min-w-8" variant="secondary">
              <Database className="size-3 min-w-3 mr-2" />
              <span className="text-xs truncate min-w-0 block">Add to dataset</span>
            </Badge>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-80" align="end" side="bottom">
          <div className="flex flex-col space-y-4">
            <span className="font-medium">Export span to dataset</span>
            <DatasetSelect onChange={(dataset) => setSelectedDataset(dataset)} />
            <Button className="ml-auto" onClick={exportSpan} disabled={!selectedDataset || isLoading}>
              {isLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Add to dataset
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
