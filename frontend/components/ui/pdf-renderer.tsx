"use client";

import { ChevronDown, ChevronUp, Maximize } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

// Import CSS at module level - these are safe for SSR
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import { Button } from "./button";
import DownloadButton from "./download-button";
import { ScrollArea } from "./scroll-area";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "./sheet";
import { Skeleton } from "./skeleton";

// Dynamically import react-pdf components to avoid SSR issues
const Document = dynamic(
  () => import("react-pdf").then((mod) => ({ default: mod.Document })),
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

const Page = dynamic(
  () => import("react-pdf").then((mod) => ({ default: mod.Page })),
  {
    ssr: false,
    loading: () => <Skeleton className="w-full h-12" />,
  }
);


type PDFFile = string | File | Blob | null;

interface PdfRendererProps {
  url: string;
  maxWidth?: number;
  className?: string;
}

export default function PdfRenderer({ url, maxWidth, className }: PdfRendererProps) {
  const [file, setFile] = useState<PDFFile>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [isClient, setIsClient] = useState(false);

  const onDocumentLoadSuccess = ({ numPages: nextNumPages }: any): void => {
    setNumPages(nextNumPages);
  };

  useEffect(() => {
    setIsClient(true);

    fetch(url)
      .then((response) => response.blob())
      .then((blob) => {
        setFile(blob);
      });
  }, [url]);

  // Show loading skeleton during SSR
  if (!isClient) {
    return (
      <div className={cn("flex flex-col space-y-2 px-1 pb-2", className)}>
        <div className="flex justify-between">
          <div className="flex space-x-2">
            <DownloadButton
              uri={url}
              filenameFallback={url}
              className="mt-1.5 w-28 flex justify-center"
              supportedFormats={[]}
              variant="secondary"
              text="Download PDF"
            />
            <Button
              variant="ghost"
              className="flex items-center mt-1.5 gap-1 text-secondary-foreground"
              disabled
            >
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
          <DownloadButton
            uri={url}
            filenameFallback={url}
            className="mt-1.5 w-28 flex justify-center"
            supportedFormats={[]}
            variant="secondary"
            text="Download PDF"
          />
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
