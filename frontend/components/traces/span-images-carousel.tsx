"use client";

import { differenceInSeconds, format } from "date-fns";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import useSWR from "swr";

import ImageWithPreview from "@/components/playground/image-with-preview";
import { Button } from "@/components/ui/button";
import { SpanImage } from "@/lib/actions/span/images";
import { swrFetcher } from "@/lib/utils";

interface SpanImagesCarouselProps {
  traceId: string;
  spanIds: string[];
  traceStartTime?: string;
  currentTime?: number;
  onTimelineChange: (time: number) => void;
}

export default function SpanImagesCarousel({
  traceId,
  spanIds,
  traceStartTime,
  currentTime,
  onTimelineChange,
}: SpanImagesCarouselProps) {
  const { projectId } = useParams();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const swrKey =
    spanIds.length > 0
      ? `/api/projects/${projectId}/traces/${traceId}/spans/images?${new URLSearchParams(spanIds.map((id) => ["id", id]))}`
      : null;

  const { data, isLoading } = useSWR<{ images: SpanImage[] }>(swrKey, swrFetcher);
  const images = data?.images || [];

  const parseClickHouseTimestamp = useCallback((timestamp: string): Date => new Date(`${timestamp}Z`), []);

  const getRelativeTime = useCallback(
    (spanStartTime: string) => {
      if (!traceStartTime) {
        return format(parseClickHouseTimestamp(spanStartTime), "HH:mm:ss");
      }

      const traceStart = new Date(traceStartTime);
      const spanStart = parseClickHouseTimestamp(spanStartTime);
      const diffInSeconds = differenceInSeconds(spanStart, traceStart);

      if (diffInSeconds <= 0) {
        return "0s";
      }

      const minutes = Math.floor(diffInSeconds / 60);
      const seconds = diffInSeconds % 60;

      if (minutes > 0 && seconds > 0) {
        return `+${minutes}m ${seconds}s`;
      } else if (minutes > 0) {
        return `+${minutes}m`;
      } else {
        return `+${seconds}s`;
      }
    },
    [traceStartTime, parseClickHouseTimestamp]
  );

  const getActiveImageIndex = useCallback(() => {
    if (!currentTime || images.length === 0) return -1;

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const spanStartTime = parseClickHouseTimestamp(image.startTime).getTime();
      const spanEndTime = parseClickHouseTimestamp(image.endTime).getTime();

      if (spanStartTime <= currentTime && currentTime <= spanEndTime) {
        return i;
      }
    }
    return -1;
  }, [currentTime, images, parseClickHouseTimestamp]);

  const activeImageIndex = getActiveImageIndex();

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
    <>
      {isLoading ? (
        <div className="flex h-full items-center justify-center p-4 gap-2">
          <Loader2 className="animate-spin w-4 h-4" />
          <span className="text-sm">Loading images...</span>
        </div>
      ) : images.length > 0 ? (
        <div className="flex flex-col items-center justify-center h-full relative">
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

          <div className="flex flex-col gap-2 items-center p-2">
            <div className="relative aspect-video bg-muted rounded-lg overflow-hidden max-w-xl h-full">
              <ImageWithPreview
                src={images[currentImageIndex].imageUrl}
                alt={`Image from ${images[currentImageIndex].spanName}`}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground text-center">
              <div className={`font-medium truncate ${activeImageIndex === currentImageIndex ? "text-primary" : ""}`}>
                {images[currentImageIndex].spanName}
              </div>
              <span className={activeImageIndex === currentImageIndex ? "text-primary" : ""}>
                {getRelativeTime(images[currentImageIndex].startTime)}
              </span>
            </div>
          </div>

          <div className="text-center text-xs text-muted-foreground">
            {currentImageIndex + 1} of {images.length} image{images.length !== 1 ? "s" : ""}
            {activeImageIndex !== -1 && (
              <span className="ml-2 text-primary font-medium">• Active: {activeImageIndex + 1}</span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
          No images found in the selected spans
        </div>
      )}
    </>
  );
}
