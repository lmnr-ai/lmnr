import React, { useState } from "react";

import { toast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

import { Button, type ButtonProps } from "./button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./dropdown-menu";

export const resolveDownloadFilename = (
  contentDisposition: string | null | undefined,
  filenameFallback: string
): string => {
  const filenameMatch = contentDisposition?.match(/filename="?([^";]+)"?/);
  return filenameMatch?.[1]?.trim() || filenameFallback;
};

export const downloadFile = async (uri: string, filenameFallback: string, fileFormat?: string) => {
  try {
    const response = await fetch(uri);

    if (!response.ok) {
      throw new Error("Download failed");
    }

    const contentDisposition = response.headers.get("Content-Disposition");
    const filename = resolveDownloadFilename(contentDisposition, filenameFallback);

    const blob = await response.blob();

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();

    // Cleanup
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (_error) {
    toast({
      title: `Error downloading ${fileFormat || "file"}`,
      variant: "destructive",
    });
  }
};

interface DownloadButtonProps {
  uri: string;
  filenameFallback: string;
  variant?: ButtonProps["variant"];
  className?: string;
  supportedFormats?: string[];
  text?: string;
}

export default function DownloadButton(props: DownloadButtonProps) {
  if (props.supportedFormats?.length && props.supportedFormats?.length > 1) {
    return <DownloadButtonMultipleFormats {...props} />;
  }
  return <DownloadButtonSingleFormat {...props} />;
}

function DownloadButtonSingleFormat({ uri, filenameFallback, variant, className, text }: DownloadButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  return (
    <Button
      variant={variant ?? "secondary"}
      disabled={isDownloading}
      onClick={async () => {
        setIsDownloading(true);
        await downloadFile(uri, filenameFallback);
        setIsDownloading(false);
      }}
    >
      {text || "Download"}
    </Button>
  );
}

function DownloadButtonMultipleFormats({
  uri,
  filenameFallback,
  supportedFormats = ["csv", "json"],
  className,
}: DownloadButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(className)} asChild disabled={isDownloading}>
        <Button icon="download" variant="secondary">
          Download
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="relative z-50 min-w-32 overflow-hidden rounded-md border bg-surface-300 text-foreground-100 shadow-md"
      >
        {supportedFormats.map((format) => {
          const formatFallback = filenameFallback.endsWith(`.${format}`)
            ? filenameFallback
            : `${filenameFallback}.${format}`;

          return (
            <DropdownMenuItem
              key={format}
              className="flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 outline-hidden"
              onClick={async () => {
                setIsDownloading(true);
                await downloadFile(uri + `/${format}`, formatFallback, format);
                setIsDownloading(false);
              }}
            >
              Download as {format.toUpperCase()}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
