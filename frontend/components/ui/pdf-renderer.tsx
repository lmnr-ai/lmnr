"use client";

// Import CSS at module level - these are safe for SSR
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import { ChevronDown, ChevronUp, Maximize } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import { Button } from "./button";
import { ScrollArea } from "./scroll-area";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "./sheet";
import { Skeleton } from "./skeleton";

// Dynamically import react-pdf components to avoid SSR issues
const Document = dynamic(
  () =>
    import("react-pdf").then((mod) => {
      try {
        mod.pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${mod.pdfjs.version}/build/pdf.worker.min.mjs`;
      } catch {
        console.error("Failed to load pdfjs worker");
      }
      return { default: mod.Document };
    }),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col gap-2">
        <Skeleton className="w-full h-12" />
        <Skeleton className="w-full h-12" />
        <Skeleton className="w-full h-12" />
      </div>
    ),
  }
);

const Page = dynamic(() => import("react-pdf").then((mod) => ({ default: mod.Page })), {
  ssr: false,
  loading: () => <Skeleton className="w-full h-12" />,
});

type PDFFile = string | File | Blob | null;

interface PdfRendererProps {
  url?: string;
  base64?: string;
  maxWidth?: number;
  className?: string;
}

/**
 * Manual base64 to Blob conversion to avoid CSP connect-src restrictions on data: URIs
 */
const base64ToBlob = (base64: string, type = "application/pdf") => {
  const base64Data = base64.includes(";base64,") ? base64.split(";base64,")[1] : base64;
  const binaryString = window.atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type });
};

export default function PdfRenderer({ url, base64, className }: PdfRendererProps) {
  const [file, setFile] = useState<PDFFile>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  const onDocumentLoadSuccess = ({ numPages: nextNumPages }: any): void => {
    setNumPages(nextNumPages);
  };

  const handleDownload = useCallback(() => {
    if (!file) return;

    const blobUrl = URL.createObjectURL(file instanceof Blob ? file : new Blob([file]));
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = url ? url.split("/").pop() || "document.pdf" : "document.pdf";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  }, [file, url]);

  useEffect(() => {
    let isMounted = true;

    const loadFile = async () => {
      if (base64) {
        try {
          // Offload to microtask to ensure asynchronous state update
          const blob = base64ToBlob(base64);
          if (isMounted) {
            setFile(blob);
          }
        } catch (e) {
          console.error("Failed to decode base64 PDF", e);
        }
      } else if (url) {
        try {
          const response = await fetch(url);
          const blob = await response.blob();
          if (isMounted) {
            setFile(blob);
          }
        } catch (e) {
          console.error("Failed to fetch PDF URL", e);
        }
      }
    };

    loadFile();

    return () => {
      isMounted = false;
    };
  }, [url, base64]);

  // Show loading skeleton while file is being fetched (works for SSR too)
  if (!file) {
    return (
      <div className={cn("flex flex-col space-y-2 px-1 pb-2", className)}>
        <div className="flex justify-between">
          <div className="flex space-x-2">
            <Button variant="secondary" className="mt-1.5 w-28 flex justify-center" disabled>
              Download PDF
            </Button>
            <Button variant="ghost" className="flex items-center mt-1.5 gap-1 text-secondary-foreground" disabled>
              loading...
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="w-full h-12" />
          <Skeleton className="w-full h-12" />
          <Skeleton className="w-full h-12" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col space-y-2 px-1 pb-2", className, isCollapsed && "h-8")}>
      <div className="flex justify-between">
        <div className="flex space-x-2">
          <Button variant="secondary" className="mt-1.5 w-28 flex justify-center" onClick={handleDownload}>
            Download PDF
          </Button>
          <Button
            variant="ghost"
            className="flex items-center mt-1.5 gap-1 text-secondary-foreground"
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            {isCollapsed ? (
              <>
                show
                <ChevronDown size={16} />
              </>
            ) : (
              <>
                hide
                <ChevronUp size={16} />
              </>
            )}
          </Button>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Maximize className="h-3.5 w-3.5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="flex flex-col overflow-auto gap-0 min-w-[50vw]">
            <SheetTitle className="sr-only">Full-screen PDF View</SheetTitle>
            <PdfDocumentContainer file={file} numPages={numPages} onDocumentLoadSuccess={onDocumentLoadSuccess} />
          </SheetContent>
        </Sheet>
      </div>
      {!isCollapsed && (
        <PdfDocumentContainer
          file={file}
          numPages={numPages}
          onDocumentLoadSuccess={onDocumentLoadSuccess}
          className="w-full h-5/6"
        />
      )}
    </div>
  );
}

function PdfDocumentContainer({
  file,
  numPages,
  onDocumentLoadSuccess,
  className,
}: {
  file: PDFFile;
  numPages: number;
  onDocumentLoadSuccess: (document: any) => void;
  className?: string;
}) {
  return (
    <Document
      file={file}
      onLoadSuccess={onDocumentLoadSuccess}
      className={cn("w-full px-2", className)}
      loading={
        <div className="flex flex-col gap-2">
          <Skeleton className="w-full h-12" />
          <Skeleton className="w-full h-12" />
          <Skeleton className="w-full h-12" />
        </div>
      }
      noData={
        <div className="flex flex-col gap-2">
          <Skeleton className="w-full h-12" />
          <Skeleton className="w-full h-12" />
          <Skeleton className="w-full h-12" />
        </div>
      }
    >
      <ScrollArea className="w-full h-full flex flex-col">
        {Array.from(new Array(numPages), (_el, index) => (
          <Page key={`page_${index + 1}`} pageNumber={index + 1} className="w-full overflow-auto" />
        ))}
      </ScrollArea>
    </Document>
  );
}
