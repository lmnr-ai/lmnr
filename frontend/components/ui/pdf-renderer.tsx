"use client";

// import { useResizeObserver } from '@wojtekmaj/react-hooks';
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import "pdfjs-dist/build/pdf.worker.min.mjs";

import { ChevronDown, ChevronUp, Maximize } from "lucide-react";
import { useEffect, useState } from "react";
import { Document, Page } from "react-pdf";

import { cn } from "@/lib/utils";

import { Button } from "./button";
import DownloadButton from "./download-button";
import { ScrollArea } from "./scroll-area";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "./sheet";
import { Skeleton } from "./skeleton";

// const options = {
//   cMapUrl: '/cmaps/',
//   standardFontDataUrl: '/standard_fonts/',
// };

type PDFFile = string | File | Blob | null;

interface PdfRendererProps {
  url: string;
  maxWidth?: number;
  className?: string;
}

export default function PdfRenderer({ url, maxWidth, className }: PdfRendererProps) {
  const [file, setFile] = useState<PDFFile>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [containerRef, setContainerRef] = useState<HTMLElement | null>(null);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  // const onResize = useCallback<ResizeObserverCallback>((entries) => {
  //   const [entry] = entries;

  //   if (entry) {
  //     setContainerWidth(entry.contentRect.width);
  //   }
  // }, []);

  // useResizeObserver(containerRef, resizeObserverOptions, onResize);

  const onDocumentLoadSuccess = ({ numPages: nextNumPages }: any): void => {
    setNumPages(nextNumPages);
  };

  useEffect(() => {
    fetch(url)
      .then((response) => response.blob())
      .then((blob) => {
        setFile(blob);
      });
  }, [url]);

  return (
    <div className={cn("flex flex-col space-y-2 px-1 pb-2", className, isCollapsed && "h-8")} ref={setContainerRef}>
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
          <SheetContent side="right" className="flex flex-col gap-0 min-w-[50vw]">
            <SheetTitle className="sr-only">Full-screen PDF View</SheetTitle>
            <PdfDocumentContainer
              file={file}
              numPages={numPages}
              onDocumentLoadSuccess={onDocumentLoadSuccess}
            />
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
    // options={options}
    >
      <ScrollArea className="w-full h-full flex flex-col">
        {Array.from(new Array(numPages), (_el, index) => (
          <Page key={`page_${index + 1}`} pageNumber={index + 1} className="w-full overflow-auto" />
        ))}
      </ScrollArea>
    </Document>
  );
}
