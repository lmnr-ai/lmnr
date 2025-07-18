"use client";

import "rrweb-player/dist/style.css";
import "@/lib/styles/session-player.css";

import { PauseIcon, PlayIcon } from "@radix-ui/react-icons";
import { Loader2 } from "lucide-react";
import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import rrwebPlayer from "rrweb-player";

import { fetchBrowserSessionRawData, UrlChange } from "@/components/session-player/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProjectContext } from "@/contexts/project-context";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { ReplayController } from "@/lib/replayer";
import { formatSecondsToMinutesAndSeconds } from "@/lib/utils";

interface SessionPlayerProps {
  hasBrowserSession: boolean | null;
  traceId: string;
  onTimelineChange: (time: number) => void;
}

interface Event {
  data: any;
  timestamp: number;
  type: number;
}

export interface SessionPlayerHandle {
  goto: (time: number) => void;
}

const speedOptions = [1, 2, 4, 8, 16];
const SessionPlayer = forwardRef<SessionPlayerHandle, SessionPlayerProps>(
  ({ hasBrowserSession, traceId, onTimelineChange }, ref) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const playerContainerRef = useRef<HTMLDivElement | null>(null);
    const playerRef = useRef<any>(null);
    const [events, setEvents] = useState<Event[]>([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [totalDuration, setTotalDuration] = useState(0);
    const [speed, setSpeed] = useLocalStorage("session-player-speed", 1);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [startTime, setStartTime] = useState(0);
    const [currentUrl, setCurrentUrl] = useState<string>("");
    const [urlChanges, setUrlChanges] = useState<UrlChange[]>([]);
    const currentUrlIndexRef = useRef<number>(0);
    const { projectId } = useProjectContext();
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Add resize observer effect
    useEffect(() => {
      if (!containerRef.current) return;

      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          setDimensions({ width, height: height - 56 }); // Subtract header height (32px) + URL bar height (24px)
        }
      });

      resizeObserver.observe(containerRef.current);

      return () => resizeObserver.disconnect();
    }, []);

    // Binary search to find current URL index - O(log n) complexity
    const findUrlIndex = (timeMs: number): number => {
      if (!urlChanges.length) return -1;

      let left = 0;
      let right = urlChanges.length - 1;
      let result = 0;

      while (left <= right) {
        const mid = Math.floor((left + right) / 2);

        if (urlChanges[mid].timestamp <= timeMs) {
          result = mid;
          left = mid + 1;
        } else {
          right = mid - 1;
        }
      }

      return result;
    };

    // Efficiently find current URL using binary search
    const updateCurrentUrl = (timeMs: number) => {
      if (!urlChanges.length) return;

      const newIndex = findUrlIndex(timeMs);
      if (newIndex === -1) return;

      // Only update if index changed (avoids unnecessary state updates)
      if (newIndex !== currentUrlIndexRef.current) {
        currentUrlIndexRef.current = newIndex;
        const newUrl = urlChanges[newIndex].url;

        if (newUrl !== currentUrl) {
          setCurrentUrl(newUrl);
        }
      }
    };

    const getEvents = useCallback(async () => {
      setIsLoading(true);
      try {
        // Fetch raw data
        const rawData = await fetchBrowserSessionRawData(
          `/api/projects/${projectId}/browser-sessions/events?traceId=${traceId}`
        );

        // Step 1: Process using our SessionEventProcessor (decompression, CSS cleaning, etc.)
        const controller = new ReplayController();
        const basicResult = controller.processRawSessionData(rawData);

        // Step 2: Apply PostHog-style processing (deduplication, chunking) to the basic events
        controller.loadProcessedEvents(basicResult.events);
        const optimizedEvents = controller.getSnapshots();

        // Use optimized events but keep original URL changes and timing
        setEvents(optimizedEvents);
        setUrlChanges(basicResult.urlChanges);
        setTotalDuration(basicResult.duration);
        setStartTime(basicResult.startTime);
        currentUrlIndexRef.current = 0;

        // Set initial URL
        if (basicResult.urlChanges.length > 0) {
          setCurrentUrl(basicResult.urlChanges[0].url);
        }

        console.log(`Processed ${basicResult.events.length} → ${optimizedEvents.length} events (PostHog optimization)`);
      } catch (e) {
        console.error("Error processing events:", e);
        setEvents([]);
        setUrlChanges([]);
        setTotalDuration(0);
        setStartTime(0);
      } finally {
        setIsLoading(false);
      }
    }, [projectId, traceId]);

    useEffect(() => {
      if (hasBrowserSession) {
        setEvents([]);
        setIsPlaying(false);
        setCurrentTime(0);
        setTotalDuration(0);
        setCurrentUrl("");
        setUrlChanges([]);
        currentUrlIndexRef.current = 0;
        getEvents();
      }
    }, [hasBrowserSession, traceId]);

    useEffect(() => {
      if (!events?.length || !playerContainerRef.current) return;

      try {
        playerRef.current = new rrwebPlayer({
          target: playerContainerRef.current,
          props: {
            showWarning: false,
            showDebug: false,
            speedOption: speedOptions,
            autoPlay: false,
            skipInactive: false,
            events,
            showController: false,
            mouseTail: false,
            width: dimensions.width,
            height: dimensions.height,
            speed,
          },
        });

        const startTime = events[0].timestamp;
        setStartTime(startTime);

        const duration = (events[events.length - 1].timestamp - events[0].timestamp) / 1000;
        setTotalDuration(duration);

        playerRef.current.addEventListener("ui-update-player-state", (event: any) => {
          if (event.payload === "playing") {
            setIsPlaying(true);
          } else if (event.payload === "paused") {
            setIsPlaying(false);
          }
        });

        playerRef.current.addEventListener("ui-update-current-time", (event: any) => {
          const newTime = event.payload / 1000;
          setCurrentTime(newTime);
          onTimelineChange(startTime + event.payload);

          // Update current URL based on the current time
          updateCurrentUrl(startTime + event.payload);
        });
      } catch (e) {
        console.error("Error initializing player:", e);
      }
    }, [events]);

    useEffect(() => {
      if (playerRef.current) {
        playerRef.current.$set({
          width: dimensions.width,
          height: dimensions.height,
          speed,
        });
        playerRef.current.triggerResize();
      }
    }, [dimensions.width, dimensions.height]);

    useEffect(() => {
      if (playerRef.current) {
        playerRef.current.setSpeed(speed);
      }
    }, [speed]);

    const handlePlayPause = useCallback(() => {
      if (playerRef.current) {
        try {
          if (isPlaying) {
            setIsPlaying(false);
            playerRef.current.pause();
          } else {
            setIsPlaying(true);
            playerRef.current.play();
          }
        } catch (e) {
          console.error("Error in play/pause:", e);
        }
      }
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
        if (wasPlaying && playerRef.current) {
          playerRef.current.pause();
        }

        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }

        debounceTimerRef.current = setTimeout(() => {
          if (playerRef.current) {
            playerRef.current.goto(time * 1000);
            if (wasPlaying) {
              requestAnimationFrame(() => {
                playerRef.current.play();
              });
            }
          }
        }, 50);
      },
      [isPlaying]
    );

    useImperativeHandle(
      ref,
      () => ({
        goto: (time: number) => {
          if (playerRef.current) {
            setCurrentTime(time);
            playerRef.current.goto(time * 1000);
            // Update URL when programmatically seeking
            updateCurrentUrl(startTime + time * 1000);
          }
        },
      }),
      [startTime, urlChanges, currentUrl]
    );

    useHotkeys("space", handlePlayPause);

    return (
      <>
        <div className="relative w-full h-full" ref={containerRef}>
          <div className="flex flex-row items-center justify-center gap-2 px-4 h-8 border-b">
            <button onClick={handlePlayPause} className="text-white py-1 rounded">
              {isPlaying ? <PauseIcon strokeWidth={1.5} /> : <PlayIcon strokeWidth={1.5} />}
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center text-white py-1 px-2 rounded text-sm">
                {speed}x
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
              min="0"
              step="0.1"
              max={totalDuration || 0}
              value={currentTime || 0}
              onChange={handleTimelineChange}
            />
            <span className="font-mono">
              {formatSecondsToMinutesAndSeconds(currentTime || 0)}/
              {formatSecondsToMinutesAndSeconds(totalDuration || 0)}
            </span>
          </div>

          {currentUrl && (
            <div className="flex items-center px-4 py-1 border-b">
              <a
                href={currentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-secondary-foreground hover:underline hover:text-foreground truncate transition-colors"
                title={currentUrl}
              >
                {currentUrl}
              </a>
            </div>
          )}

          {isLoading && (
            <div className="flex w-full h-full gap-2 p-4 items-center justify-center -mt-12">
              <Loader2 className="animate-spin w-4 h-4" /> Loading browser session...
            </div>
          )}
          {!isLoading && events.length === 0 && hasBrowserSession && (
            <div className="flex w-full h-full gap-2 p-4 items-center justify-center -mt-12">
              No browser session was recorded. Either the session is still being processed or you have an outdated SDK
              version.
            </div>
          )}
          {!isLoading && events.length > 0 && <div ref={playerContainerRef} />}
        </div>
      </>
    );
  }
);

SessionPlayer.displayName = "SessionPlayer";

export default memo(SessionPlayer);
