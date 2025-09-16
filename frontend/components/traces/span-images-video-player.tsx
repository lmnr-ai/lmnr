"use client";

import { PauseIcon, PlayIcon } from "@radix-ui/react-icons";
import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import useSWR from "swr";

import { useTraceViewStore, useTraceViewStoreContext } from "@/components/traces/trace-view/trace-view-store.tsx";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { SharedSpanImage } from "@/lib/actions/shared/spans/images";
import { SpanImage } from "@/lib/actions/span/images";
import { cn, formatSecondsToMinutesAndSeconds } from "@/lib/utils";

interface SpanImagesVideoPlayerProps {
  traceId: string;
  spanIds: string[];
  isShared?: boolean;
}

const speedOptions = [1, 2, 4, 8, 16];
const frameInterval = 41.67; // 24fps;
const SpanImagesVideoPlayer = ({ traceId, spanIds, isShared = false }: SpanImagesVideoPlayerProps) => {
  const { projectId } = useParams();
  const [preloadedImages, setPreloadedImages] = useState<Map<string, HTMLImageElement>>(new Map());
  const [isPlaying, setIsPlaying] = useState(false);
  const [totalDuration, setTotalDuration] = useState(0);
  const [speed, setSpeed] = useLocalStorage("image-video-player-speed", 1);
  const [startTime, setStartTime] = useState(0);
  const [isLoadingImages, setIsLoadingImages] = useState(false);

  const sliderRef = useRef<HTMLInputElement>(null);
  const timeDisplayRef = useRef<HTMLSpanElement>(null);

  const { setSessionTime, incrementSessionTime } = useTraceViewStoreContext((state) => ({
    setSessionTime: state.setSessionTime,
    incrementSessionTime: state.incrementSessionTime,
  }));

  const store = useTraceViewStore();

  const swrKey =
    spanIds.length > 0
      ? {
        url: isShared
          ? `/api/shared/traces/${traceId}/spans/images`
          : `/api/projects/${projectId}/traces/${traceId}/spans/images`,
        spanIds,
      }
      : null;

  const postFetcher = async ({ url, spanIds }: { url: string; spanIds: string[] }) => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ spanIds }),
    });

    if (!response.ok) {
      throw new Error("Failed to fetch images");
    }

    return response.json();
  };

  const { data, isLoading } = useSWR<{ images: (SpanImage | SharedSpanImage)[] }>(swrKey, postFetcher);

  const images = useMemo(() => {
    if (!data?.images) return [];
    return [...data.images].sort((a, b) => a.timestamp - b.timestamp);
  }, [data]);

  const preloadImages = useCallback(async (imageData: (SpanImage | SharedSpanImage)[]) => {
    setIsLoadingImages(true);
    const imageMap = new Map<string, HTMLImageElement>();

    const loadPromises = imageData.map(
      (img) =>
        new Promise<void>((resolve, reject) => {
          const htmlImg = new Image();
          htmlImg.onload = () => {
            imageMap.set(img.imageUrl, htmlImg);
            resolve();
          };
          htmlImg.onerror = () => {
            console.warn(`Failed to load image: ${img.imageUrl}`);
            resolve();
          };
          htmlImg.src = img.imageUrl;
        })
    );

    try {
      await Promise.all(loadPromises);
      setPreloadedImages(imageMap);
    } catch (error) {
      console.error("Error preloading images:", error);
    } finally {
      setIsLoadingImages(false);
    }
  }, []);

  useEffect(() => {
    if (images.length > 0) {
      const firstTimestamp = images[0].timestamp;
      const lastTimestamp = images[images.length - 1].timestamp;
      const duration = (lastTimestamp - firstTimestamp) / 1000;

      setStartTime(firstTimestamp);
      setTotalDuration(duration);
      setSessionTime(0);

      if (sliderRef.current) {
        sliderRef.current.value = "0";
        sliderRef.current.max = duration.toString();
      }
      if (timeDisplayRef.current) {
        timeDisplayRef.current.textContent = `${formatSecondsToMinutesAndSeconds(0)}/${formatSecondsToMinutesAndSeconds(duration)}`;
      }

      preloadImages(images);
    }
  }, [images, preloadImages, setSessionTime]);

  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const findImageIndexForTime = useCallback(
    (sessionTime: number): number => {
      if (!sessionTime || images.length === 0) return 0;

      const absoluteTime = startTime + sessionTime * 1000;
      let bestIndex = 0;

      for (let i = 0; i < images.length; i++) {
        if (images[i].timestamp <= absoluteTime) {
          bestIndex = i;
        } else {
          break;
        }
      }

      return bestIndex;
    },
    [images, startTime]
  );

  useEffect(() => {
    const unsubscribe = store.subscribe((state, prevState) => {
      if (state.sessionTime !== prevState.sessionTime) {
        const sessionTime = state.sessionTime || 0;

        if (sliderRef.current) {
          sliderRef.current.value = sessionTime.toString();
        }

        if (timeDisplayRef.current) {
          timeDisplayRef.current.textContent = `${formatSecondsToMinutesAndSeconds(sessionTime)}/${formatSecondsToMinutesAndSeconds(totalDuration)}`;
        }

        const newIndex = findImageIndexForTime(sessionTime);
        if (newIndex !== currentImageIndex) {
          setCurrentImageIndex(newIndex);
        }
      }
    });

    return unsubscribe;
  }, [store, totalDuration, findImageIndexForTime, currentImageIndex]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (isPlaying && totalDuration > 0) {
        const timeIncrement = (frameInterval / 1000) * speed;
        const isComplete = incrementSessionTime(timeIncrement, totalDuration);

        if (isComplete) {
          setIsPlaying(false);
        }
      }
    }, frameInterval);

    return () => clearInterval(interval);
  }, [isPlaying, speed, totalDuration, incrementSessionTime]);

  const handleTimelineChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const time = parseFloat(e.target.value);

      setSessionTime(time);

      if (timeDisplayRef.current) {
        timeDisplayRef.current.textContent = `${formatSecondsToMinutesAndSeconds(time)}/${formatSecondsToMinutesAndSeconds(totalDuration)}`;
      }

      const newIndex = findImageIndexForTime(time);
      if (newIndex !== currentImageIndex) {
        setCurrentImageIndex(newIndex);
      }
    },
    [setSessionTime, findImageIndexForTime, currentImageIndex, totalDuration]
  );

  const handlePlayPause = useCallback(() => {
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  useHotkeys("space", handlePlayPause, { preventDefault: true });

  if (isLoading || isLoadingImages) {
    return (
      <div className="flex h-full items-center justify-center p-4 gap-2">
        <Loader2 className="animate-spin w-4 h-4" />
        <span className="text-sm">{isLoading ? "Loading images..." : "Preloading images..."}</span>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="flex w-full h-full gap-2 p-4 items-center justify-center">
        <div className="text-center">
          <h3 className="text-lg font-medium mb-2">No images</h3>
          <p className="text-sm text-muted-foreground">There are no images in the selected spans.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex flex-row items-center justify-center gap-2 px-4 h-8 border-b flex-shrink-0">
        <Button onClick={handlePlayPause} variant="ghost" size="sm" className="p-1">
          {isPlaying ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="px-2 text-sm">
              {speed}x
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {speedOptions.map((speedOption) => (
              <DropdownMenuItem key={speedOption} onClick={() => setSpeed(speedOption)}>
                {speedOption}x
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <input
          ref={sliderRef}
          type="range"
          className="flex-grow cursor-pointer"
          min={0}
          step={0.01}
          max={totalDuration || 0}
          defaultValue={0}
          onChange={handleTimelineChange}
        />

        <span ref={timeDisplayRef} className="font-mono text-sm">
          {formatSecondsToMinutesAndSeconds(0)}/{formatSecondsToMinutesAndSeconds(totalDuration || 0)}
        </span>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 h-full">
        <div className="relative h-full w-full flex items-center justify-center">
          {images.map((image, index) => (
            <img
              key={image.imageUrl}
              src={image.imageUrl}
              alt={`Image from ${image.spanName}`}
              className={cn(`absolute max-w-full max-h-full object-contain opacity-0`, {
                "opacity-100": index === currentImageIndex,
              })}
              style={{
                display: preloadedImages.has(image.imageUrl) ? "block" : "none",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default SpanImagesVideoPlayer;
