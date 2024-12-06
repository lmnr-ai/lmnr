import { Loader2, ChevronDown } from "lucide-react";
import { useState } from "react";

import { toast } from "@/lib/hooks/use-toast";

import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { cn } from "@/lib/utils";

const downloadFile = async (
  uri: string,
  fileFormat: string,
  filenameFallback: string,
) => {
  try {
    const response = await fetch(uri);

    if (!response.ok) {
      throw new Error('Download failed');
    }

    const contentDisposition = response.headers.get('Content-Disposition');
    const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
    const filename = filenameMatch?.[1] || filenameFallback;

    const blob = await response.blob();

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();

    // Cleanup
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    toast({
      title: `Error downloading ${fileFormat}`,
      variant: 'destructive'
    });
  }
};

interface DownloadButtonProps {
  uri: string;
  filenameFallback: string;
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost';
  className?: string;
  supportedFormats?: string[];
}

export default function DownloadButton({
  uri,
  filenameFallback,
  supportedFormats = ['csv', 'json'],
  variant = 'secondary',
  className
}: DownloadButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-7  items-center justify-between rounded-md border bg-transparent px-3 py-2 text-sm focus:outline-none">
        Download
        <ChevronDown className="h-4 w-4 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="relative z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
      >
        {supportedFormats.map((format) => (
          <DropdownMenuItem
            key={format}
            className="flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground"
            onClick={() => {
              downloadFile(uri + `/${format}`, format, filenameFallback + `.${format}`);
            }}
          >
            Download as {format.toUpperCase()}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
