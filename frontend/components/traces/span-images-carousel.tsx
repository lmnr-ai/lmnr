"use client";

import { differenceInSeconds, format } from "date-fns";
import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";
import useSWR from "swr";

import ImageWithPreview from "@/components/playground/image-with-preview";
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
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
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState<{ current: number; count: number }>({ count: 0, current: 0 });

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

  useEffect(() => {
    if (!api) {
      return;
    }

    setCurrent((prev) => ({ ...prev, count: api.scrollSnapList().length }));
    setCurrent((prev) => ({ ...prev, current: api.selectedScrollSnap() + 1 }));
    if (images[api.selectedScrollSnap()]) {
      const selectedImage = images[api.selectedScrollSnap()];
      const spanStartTime = parseClickHouseTimestamp(selectedImage.startTime).getTime();
      onTimelineChange(spanStartTime);
    }

    const handleSelect = () => {
      const newIndex = api.selectedScrollSnap();
      setCurrent((prev) => ({ ...prev, current: newIndex + 1 }));

      if (images[newIndex]) {
        const selectedImage = images[newIndex];
        const spanStartTime = parseClickHouseTimestamp(selectedImage.startTime).getTime();
        onTimelineChange(spanStartTime);
      }
    };

    api.on("select", handleSelect);

    return () => {
      api.off("select", handleSelect);
    };
  }, [api, images, onTimelineChange, parseClickHouseTimestamp]);

  return (
    <>
      {isLoading ? (
        <div className="flex h-full items-center justify-center p-4 gap-2">
          <Loader2 className="animate-spin w-4 h-4" />
          <span className="text-sm">Loading images...</span>
        </div>
      ) : images.length > 0 ? (
        <Carousel className="flex flex-col items-center justify-center h-full" setApi={setApi}>
          <CarouselContent className="size-full p-2 my-auto">
            {images.map((image, index) => (
              <CarouselItem className="flex items-center justify-center h-full" key={`${image.spanId}-${index}`}>
                <div className="flex flex-col gap-2 items-center">
                  <div className="relative aspect-video bg-muted rounded-lg overflow-hidden max-w-xl h-full">
                    <ImageWithPreview
                      src={image.imageUrl}
                      alt={`Image from ${image.spanName}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground text-center">
                    <div className={`font-medium truncate ${activeImageIndex === index ? "text-primary" : ""}`}>
                      {image.spanName}
                    </div>
                    <span className={activeImageIndex === index ? "text-primary" : ""}>
                      {getRelativeTime(image.startTime)}
                    </span>
                  </div>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="left-1" />
          <CarouselNext className="right-1" />
          <div className="text-center text-xs text-muted-foreground">
            {current.current} of {current.count} image{current.count !== 1 ? "s" : ""}
            {activeImageIndex !== -1 && (
              <span className="ml-2 text-primary font-medium">• Active: {activeImageIndex + 1}</span>
            )}
          </div>
        </Carousel>
      ) : (
        <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
          No images found in the selected spans
        </div>
      )}
    </>
  );
}
