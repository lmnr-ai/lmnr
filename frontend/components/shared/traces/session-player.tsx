"use client";

import "rrweb-player/dist/style.css";
import "@/lib/styles/session-player.css";

import { PauseIcon, PlayIcon } from "@radix-ui/react-icons";
import { Loader2, X } from "lucide-react";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import rrwebPlayer from "rrweb-player";

import { fetchBrowserSessionEvents, UrlChange } from "@/components/session-player/utils";
import SpanImagesVideoPlayer, { SpanImagesVideoPlayerHandle } from "@/components/traces/span-images-video-player";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { formatSecondsToMinutesAndSeconds } from "@/lib/utils";

interface SessionPlayerProps {
  hasBrowserSession: boolean | null;
  traceId: string;
  onTimelineChange: (time: number) => void;
  llmSpanIds?: string[];
  onClose: () => void;
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
  ({ hasBrowserSession, traceId, onTimelineChange, llmSpanIds = [], onClose }, ref) => {
    const playerContainerRef = useRef<HTMLDivElement | null>(null);
    const browserContentRef = useRef<HTMLDivElement | null>(null);
    const playerRef = useRef<any>(null);
    const imageVideoPlayerRef = useRef<SpanImagesVideoPlayerHandle | null>(null);
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
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState(hasBrowserSession ? "browser-session" : "images");

    // Update active tab when hasBrowserSession changes
    useEffect(() => {
      if (!hasBrowserSession && activeTab === "browser-session") {
        setActiveTab("images");
      }
    }, [hasBrowserSession, activeTab]);

    useEffect(() => {
      if (!browserContentRef.current || activeTab !== "browser-session") return;

      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          setDimensions({ width, height });
        }
      });

      resizeObserver.observe(browserContentRef.current);

      return () => resizeObserver.disconnect();
    }, [activeTab]);

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

    const updateCurrentUrl = (timeMs: number) => {
      if (!urlChanges.length) return;

      const newIndex = findUrlIndex(timeMs);
      if (newIndex === -1) return;

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
        // Keep the shared API endpoint
        const result = await fetchBrowserSessionEvents(`/api/shared/traces/${traceId}/browser-sessions/events`);

        setEvents(result.events);
        setUrlChanges(result.urlChanges);
        setTotalDuration(result.duration);
        setStartTime(result.startTime);
        currentUrlIndexRef.current = 0;

        if (result.urlChanges.length > 0) {
          setCurrentUrl(result.urlChanges[0].url);
        }
      } catch (e) {
        console.error("Error processing events:", e);
        setEvents([]);
        setUrlChanges([]);
        setTotalDuration(0);
        setStartTime(0);
      } finally {
        setIsLoading(false);
      }
    }, [traceId]);

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
    }, [hasBrowserSession, traceId, getEvents]);

    useEffect(() => {
      if (!events?.length || !playerContainerRef.current || activeTab !== "browser-session") {
        if (playerRef.current) {
          playerRef.current.$destroy?.();
          playerRef.current = null;
        }
        return;
      }

      if (playerRef.current) {
        playerRef.current.$destroy?.();
        playerRef.current = null;
      }

      if (playerContainerRef.current) {
        playerContainerRef.current.innerHTML = "";
      }

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
            width: dimensions.width || 800,
            height: dimensions.height || 600,
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

          updateCurrentUrl(startTime + event.payload);
        });
      } catch (e) {
        console.error("Error initializing player:", e);
      }
    }, [events, activeTab, speed, startTime, onTimelineChange]);

    useEffect(() => {
      if (!playerRef.current || !dimensions.width || !dimensions.height) return;

      try {
        playerRef.current.$set({
          width: dimensions.width,
          height: dimensions.height,
        });

        requestAnimationFrame(() => {
          if (playerRef.current) {
            playerRef.current.triggerResize?.();
          }
        });
      } catch (e) {
        console.error("Error resizing player:", e);
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
          if (activeTab === "browser-session" && playerRef.current) {
            setCurrentTime(time);
            playerRef.current.goto(time * 1000);
            updateCurrentUrl(startTime + time * 1000);
          } else if (activeTab === "images" && imageVideoPlayerRef.current) {
            imageVideoPlayerRef.current.goto(time);
          }
        },
      }),
      [activeTab, startTime, urlChanges, currentUrl]
    );

    useHotkeys("space", handlePlayPause, { enabled: activeTab === "browser-session" });

    useEffect(
      () => () => {
        if (playerRef.current) {
          try {
            playerRef.current.$destroy?.();
            playerRef.current = null;
          } catch (e) {
            console.error("Error cleaning up player:", e);
          }
        }
      },
      []
    );

    return (
      <div className="relative w-full h-full flex flex-col">
        <div className="h-10 border-b pl-4 pr-2 flex items-center gap-0 flex-shrink-0">
          {hasBrowserSession && (
            <button
              onClick={() => setActiveTab("browser-session")}
              className={`mx-2 inline-flex items-center justify-center whitespace-nowrap border-b-2 py-2 transition-all text-sm first-of-type:ml-0 gap-2 font-medium ${activeTab === "browser-session"
                ? "border-secondary-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
            >
              Session
            </button>
          )}

          <button
            onClick={() => setActiveTab("images")}
            className={`mx-2 inline-flex items-center justify-center whitespace-nowrap border-b-2 py-2 text-sm transition-all gap-2 font-medium ${activeTab === "images"
              ? "border-secondary-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
              } ${!hasBrowserSession ? "first-of-type:ml-0" : ""}`}
          >
            Images
          </button>

          <Button onClick={onClose} className="ml-auto" variant="ghost">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 min-h-0">
          {activeTab === "browser-session" && (
            <div ref={browserContentRef} className="h-full flex flex-col">
              {!hasBrowserSession ? (
                <div className="flex w-full h-full gap-2 p-4 items-center justify-center">
                  <div className="text-center">
                    <h3 className="text-lg font-medium mb-2">No browser session</h3>
                    <p className="text-sm text-muted-foreground">
                      Either the session is still being processed or you have an outdated SDK version.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-row items-center justify-center gap-2 px-4 h-8 border-b flex-shrink-0">
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
                    <div className="flex items-center px-4 py-1 border-b flex-shrink-0">
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

                  <div className="flex-1 min-h-0">
                    {isLoading && (
                      <div className="flex w-full h-full gap-2 p-4 items-center justify-center">
                        <Loader2 className="animate-spin w-4 h-4" /> Loading browser session...
                      </div>
                    )}
                    {!isLoading && events.length === 0 && hasBrowserSession && (
                      <div className="flex w-full h-full gap-2 p-4 items-center justify-center">
                        No browser session was recorded. Either the session is still being processed or you have an
                        outdated SDK version.
                      </div>
                    )}
                    {!isLoading && events.length > 0 && <div ref={playerContainerRef} className="w-full h-full" />}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === "images" && (
            <div className="h-full">
              <SpanImagesVideoPlayer
                ref={imageVideoPlayerRef}
                traceId={traceId}
                spanIds={llmSpanIds}
                onTimelineChange={onTimelineChange}
                isShared
              />
            </div>
          )}
        </div>
      </div>
    );
  }
);

SessionPlayer.displayName = "SessionPlayer";

export default SessionPlayer;
