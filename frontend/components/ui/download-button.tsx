import { Loader2 } from "lucide-react";
import { useState } from "react";

import { toast } from "@/lib/hooks/use-toast";

import { Button } from "./button";

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
  fileFormat: string;
  filenameFallback: string;
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost';
  className?: string;
}

export default function DownloadButton({
  uri,
  fileFormat,
  filenameFallback,
  variant = 'secondary',
  className
}: DownloadButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  return (
    <Button
      variant={variant}
      className={className}
      onClick={async () => {
        setIsDownloading(true);
        await downloadFile(uri, fileFormat, filenameFallback);
        setIsDownloading(false);
      }}
    >
      {isDownloading && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
      Download {fileFormat}
    </Button>
  );
};
