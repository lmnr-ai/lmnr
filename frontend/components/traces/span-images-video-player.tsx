"use client";

import { PauseIcon, PlayIcon } from "@radix-ui/react-icons";
import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import useSWR from "swr";

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
import { formatSecondsToMinutesAndSeconds } from "@/lib/utils";

interface SpanImagesVideoPlayerProps {
  traceId: string;
  spanIds: string[];
  onTimelineChange: (time: number) => void;
  isShared?: boolean;
}

export interface SpanImagesVideoPlayerHandle {
  goto: (time: number) => void;
}

const speedOptions = [1, 2, 4, 8, 16];

const SpanImagesVideoPlayer = forwardRef<SpanImagesVideoPlayerHandle, SpanImagesVideoPlayerProps>(
  ({ traceId, spanIds, onTimelineChange, isShared = false }, ref) => {
    const { projectId } = useParams();
    const [images, setImages] = useState<(SpanImage | SharedSpanImage)[]>([]);
    const [preloadedImages, setPreloadedImages] = useState<Map<string, HTMLImageElement>>(new Map());
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [totalDuration, setTotalDuration] = useState(0);
    const [speed, setSpeed] = useLocalStorage("image-video-player-speed", 1);
    const [startTime, setStartTime] = useState(0);
    const [isLoadingImages, setIsLoadingImages] = useState(false);
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const playIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const swrKey = spanIds.length > 0 ? { url: isShared ? `/api/shared/traces/${traceId}/spans/images` : `/api/projects/${projectId}/traces/${traceId}/spans/images`, spanIds } : null;

    const postFetcher = async ({ url, spanIds }: { url: string; spanIds: string[] }) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ spanIds }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch images');
      }

      return response.json();
    };

    const { data, isLoading } = useSWR<{ images: (SpanImage | SharedSpanImage)[] }>(swrKey, postFetcher);

    // Preload all images when data is available
    const preloadImages = useCallback(async (imageData: (SpanImage | SharedSpanImage)[]) => {
      setIsLoadingImages(true);
      const imageMap = new Map<string, HTMLImageElement>();

      const loadPromises = imageData.map((img) => new Promise<void>((resolve, reject) => {
        const htmlImg = new Image();
        htmlImg.onload = () => {
          imageMap.set(img.imageUrl, htmlImg);
          resolve();
        };
        htmlImg.onerror = () => {
          console.warn(`Failed to load image: ${img.imageUrl}`);
          resolve(); // Don't reject, just skip this image
        };
        htmlImg.src = img.imageUrl;
      }));

      try {
        await Promise.all(loadPromises);
        setPreloadedImages(imageMap);
      } catch (error) {
        console.error("Error preloading images:", error);
      } finally {
        setIsLoadingImages(false);
      }
    }, []);

    // Process and sort images by timestamp
    useEffect(() => {
      if (data?.images) {
        const sortedImages = [...data.images].sort((a, b) => a.timestamp - b.timestamp);
        setImages(sortedImages);

        if (sortedImages.length > 0) {
          const firstTimestamp = sortedImages[0].timestamp;
          const lastTimestamp = sortedImages[sortedImages.length - 1].timestamp;
          setStartTime(firstTimestamp);
          setTotalDuration((lastTimestamp - firstTimestamp) / 1000); // Convert to seconds
          setCurrentTime(0);
          setCurrentImageIndex(0);

          // Preload all images
          preloadImages(sortedImages);
        }
      }
    }, [data, preloadImages]);

    // Find the appropriate image for a given timestamp
    const findImageIndexForTime = useCallback((timeMs: number): number => {
      if (!images.length) return -1;

      const absoluteTime = startTime + timeMs;
      let bestIndex = 0;

      for (let i = 0; i < images.length; i++) {
        if (images[i].timestamp <= absoluteTime) {
          bestIndex = i;
        } else {
          break;
        }
      }

      return bestIndex;
    }, [images, startTime]);

    // Update current image based on timeline position
    const updateCurrentImage = useCallback((timeMs: number) => {
      const newIndex = findImageIndexForTime(timeMs);
      if (newIndex !== -1 && newIndex !== currentImageIndex) {
        setCurrentImageIndex(newIndex);
      }
    }, [findImageIndexForTime, currentImageIndex]);

    // Debounced version for timeline changes to reduce parent updates
    const debouncedTimelineChange = useCallback((time: number) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        onTimelineChange(time);
      }, 16); // ~60fps for parent updates
    }, [onTimelineChange]);

    // Auto-play functionality
    useEffect(() => {
      if (isPlaying && totalDuration > 0) {
        playIntervalRef.current = setInterval(() => {
          setCurrentTime((prevTime) => {
            const newTime = prevTime + (0.01 * speed); // 10ms interval = 0.01 seconds
            if (newTime >= totalDuration) {
              setIsPlaying(false);
              return totalDuration;
            }

            // Update image and notify parent
            const absoluteTime = startTime + newTime * 1000;
            updateCurrentImage(newTime * 1000);
            debouncedTimelineChange(absoluteTime);

            return newTime;
          });
        }, 10);
      } else {
        if (playIntervalRef.current) {
          clearInterval(playIntervalRef.current);
          playIntervalRef.current = null;
        }
      }

      return () => {
        if (playIntervalRef.current) {
          clearInterval(playIntervalRef.current);
          playIntervalRef.current = null;
        }
      };
    }, [isPlaying, speed, totalDuration, startTime, updateCurrentImage, onTimelineChange]);

    const handlePlayPause = useCallback(() => {
      setIsPlaying(!isPlaying);
    }, [isPlaying]);

    const handleSpeedChange = useCallback(
      (newSpeed: number) => {
        setSpeed(newSpeed);
      },
      [setSpeed]
    );

    const handleTimelineChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = parseFloat(e.target.value);
        setCurrentTime(time);

        const wasPlaying = isPlaying;
        if (wasPlaying) {
          setIsPlaying(false);
        }

        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }

        debounceTimerRef.current = setTimeout(() => {
          updateCurrentImage(time * 1000);
          const absoluteTime = startTime + time * 1000;
          onTimelineChange(absoluteTime);

          if (wasPlaying) {
            setIsPlaying(true);
          }
        }, 50);
      },
      [isPlaying, updateCurrentImage, startTime, onTimelineChange]
    );

    useImperativeHandle(
      ref,
      () => ({
        goto: (time: number) => {
          const relativeTime = (time - startTime) / 1000; // Convert to seconds relative to start
          setCurrentTime(Math.max(0, Math.min(relativeTime, totalDuration)));
          updateCurrentImage(time - startTime);
        },
      }),
      [startTime, totalDuration, updateCurrentImage]
    );

    useHotkeys("space", handlePlayPause, { preventDefault: true });

    useEffect(
      () => () => {
        if (playIntervalRef.current) {
          clearInterval(playIntervalRef.current);
        }
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        // Clean up preloaded images
        setPreloadedImages(new Map());
      },
      []
    );

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
            <p className="text-sm text-muted-foreground">There are no images in this trace.</p>
          </div>
        </div>
      );
    }

    const currentImage = images[currentImageIndex];

    return (
      <div className="flex flex-col h-full w-full">
        {/* Timeline Controls */}
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
                <DropdownMenuItem key={speedOption} onClick={() => handleSpeedChange(speedOption)}>
                  {speedOption}x
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <input
            type="range"
            className="flex-grow cursor-pointer"
            min={0}
            step={0.01}
            max={totalDuration || 0}
            value={currentTime || 0}
            onChange={handleTimelineChange}
          />

          <span className="font-mono text-sm">
            {formatSecondsToMinutesAndSeconds(currentTime || 0)}/
            {formatSecondsToMinutesAndSeconds(totalDuration || 0)}
          </span>
        </div>

        {/* Image Display */}
        <div className="flex-1 flex items-center justify-center p-4 h-full">
          {currentImage && preloadedImages.has(currentImage.imageUrl) && (
            <div className="h-full">
              <img
                src={currentImage.imageUrl}
                alt={`Image from ${currentImage.spanName}`}
                className="max-w-full max-h-full object-contain"
                style={{ display: 'block' }} // Ensure it's immediately visible since it's preloaded
              />
            </div>
          )}
        </div>
      </div>
    );
  }
);

SpanImagesVideoPlayer.displayName = "SpanImagesVideoPlayer";

export default SpanImagesVideoPlayer;
