"use client";

import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { SpanImage } from "@/lib/actions/span/images";
import { swrFetcher } from "@/lib/utils";

interface SpanImagesCarouselProps {
  traceId: string;
  spanIds: string[];
  onTimelineChange: (time: number) => void;
  isShared?: boolean;
}

export default function SpanImagesCarousel({
  traceId,
  spanIds,
  onTimelineChange,
  isShared = false,
}: SpanImagesCarouselProps) {
  const { projectId } = useParams();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const swrKey =
    spanIds.length > 0
      ? isShared
        ? `/api/shared/traces/${traceId}/spans/images?${new URLSearchParams(spanIds.map((id) => ["id", id]))}`
        : `/api/projects/${projectId}/traces/${traceId}/spans/images?${new URLSearchParams(spanIds.map((id) => ["id", id]))}`
      : null;

  const { data, isLoading } = useSWR<{ images: SpanImage[] }>(swrKey, swrFetcher);
  const images = data?.images || [];

  const parseClickHouseTimestamp = useCallback((timestamp: string): Date => new Date(`${timestamp}Z`), []);

  const goToPrevious = useCallback(() => {
    if (images.length === 0) return;
    setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  }, [images.length]);

  const goToNext = useCallback(() => {
    if (images.length === 0) return;
    setCurrentImageIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  }, [images.length]);

  useEffect(() => {
    if (images.length > 0 && images[currentImageIndex]) {
      const selectedImage = images[currentImageIndex];
      const spanStartTime = parseClickHouseTimestamp(selectedImage.startTime).getTime();
      onTimelineChange(spanStartTime);
    }
  }, [currentImageIndex, images, onTimelineChange, parseClickHouseTimestamp]);

  useEffect(() => {
    if (images.length > 0 && currentImageIndex >= images.length) {
      setCurrentImageIndex(0);
    }
  }, [images.length, currentImageIndex]);

  useHotkeys("left", goToPrevious, { preventDefault: true });
  useHotkeys("right", goToNext, { preventDefault: true });

  return (
    <div ref={containerRef} className="flex flex-col h-full w-full">
      {isLoading ? (
        <div className="flex h-full items-center justify-center p-4 gap-2">
          <Loader2 className="animate-spin w-4 h-4" />
          <span className="text-sm">Loading images...</span>
        </div>
      ) : images.length > 0 ? (
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-center py-2 px-4 border-b flex-shrink-0">
            <span className="text-sm text-muted-foreground">
              {currentImageIndex + 1} / {images.length}
            </span>
          </div>

          <div className="flex items-center justify-center flex-1 relative p-2 min-h-0">
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-1 top-1/2 -translate-y-1/2 z-10 size-8 rounded-full"
              onClick={goToPrevious}
              disabled={images.length <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="absolute right-3 top-1/2 -translate-y-1/2 z-10 size-8 rounded-full"
              onClick={goToNext}
              disabled={images.length <= 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            <img
              src={images[currentImageIndex].imageUrl}
              alt={`Image from ${images[currentImageIndex].spanName}`}
              className="max-w-full max-h-full object-contain cursor-pointer hover:opacity-90"
            />
          </div>
        </div>
      ) : (
        <div className="flex w-full h-full gap-2 p-4 items-center justify-center">
          <div className="text-center">
            <h3 className="text-lg font-medium mb-2">No images</h3>
            <p className="text-sm text-muted-foreground">There are no images in this trace.</p>
          </div>
        </div>
      )}
    </div>
  );
}
