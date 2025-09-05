"use client";

import { ChevronLeft, ChevronRight, Images, Loader2 } from "lucide-react";
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
  const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const swrKey =
    spanIds.length > 0
      ? isShared
        ? `/api/shared/traces/${traceId}/spans/images?${new URLSearchParams(spanIds.map((id) => ["id", id]))}`
        : `/api/projects/${projectId}/traces/${traceId}/spans/images?${new URLSearchParams(spanIds.map((id) => ["id", id]))}`
      : null;

  const { data, isLoading } = useSWR<{ images: SpanImage[] }>(swrKey, swrFetcher);
  const images = data?.images || [];

  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerDimensions({ width, height });
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

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
        <div className="flex items-center justify-center h-full w-full relative">
          <Button
            variant="outline"
            size="icon"
            className="absolute left-1 top-1/2 -translate-y-1/2 z-10 size-8 rounded-full"
            onClick={goToPrevious}
            disabled={images.length <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 z-10 size-8 rounded-full"
            onClick={goToNext}
            disabled={images.length <= 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          <div
            className="flex items-center justify-center p-2"
            style={{
              width: containerDimensions.width,
              height: containerDimensions.height,
            }}
          >
            <img
              src={images[currentImageIndex].imageUrl}
              alt={`Image from ${images[currentImageIndex].spanName}`}
              className="object-contain cursor-pointer hover:opacity-90"
              style={{
                maxWidth: `${containerDimensions.width - 16}px`,
                maxHeight: `${containerDimensions.height - 16}px`,
                width: "auto",
                height: "auto",
              }}
            />
          </div>
        </div>
      ) : (
        <div className="flex w-full h-full gap-2 p-4 items-center justify-center">
          <div className="text-center">
            <Images className="mx-auto mb-4 w-12 h-12 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">No Screenshots</h3>
            <p className="text-sm text-muted-foreground">There are no screenshots for this trace.</p>
          </div>
        </div>
      )}
    </div>
  );
}
