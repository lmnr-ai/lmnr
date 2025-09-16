"use client";

import "rrweb-player/dist/style.css";
import "@/lib/styles/session-player.css";

import { PauseIcon, PlayIcon } from "@radix-ui/react-icons";
import { Loader2, X } from "lucide-react";
import { useParams } from "next/navigation";
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import rrwebPlayer from "rrweb-player";

import { fetchBrowserSessionEvents, UrlChange } from "@/components/session-player/utils";
import SpanImagesVideoPlayer from "@/components/traces/span-images-video-player";
import { useTraceViewStoreContext } from "@/components/traces/trace-view/trace-view-store";
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
  llmSpanIds?: string[];
  onClose: () => void;
}

interface Event {
  data: any;
  timestamp: number;
  type: number;
}

const speedOptions = [1, 2, 4, 8, 16];

const SessionPlayer = ({ hasBrowserSession, traceId, llmSpanIds = [], onClose }: SessionPlayerProps) => {
  // Refs
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const browserContentRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const currentUrlIndexRef = useRef<number>(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Zustand store
  const { sessionTime, setSessionTime } = useTraceViewStoreContext((state) => ({
    sessionTime: state.sessionTime || 0,
    setSessionTime: state.setSessionTime,
  }));

  // Local states (essential only)
  const [events, setEvents] = useState<Event[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [totalDuration, setTotalDuration] = useState(0);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [currentUrl, setCurrentUrl] = useState<string>("");
  const [urlChanges, setUrlChanges] = useState<UrlChange[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(hasBrowserSession ? "browser-session" : "images");

  // Local storage
  const [speed, setSpeed] = useLocalStorage("session-player-speed", 1);

  // Params
  const { projectId } = useParams();

  // Update active tab when hasBrowserSession changes
  useEffect(() => {
    if (!hasBrowserSession && activeTab === "browser-session") {
      setActiveTab("images");
    }
  }, [hasBrowserSession, activeTab]);

  // Handle container resizing
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

  // URL finding utilities
  const findUrlIndex = useCallback(
    (timeMs: number): number => {
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
    },
    [urlChanges]
  );

  const updateCurrentUrl = useCallback(
    (timeMs: number) => {
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
    },
    [urlChanges, findUrlIndex, currentUrl]
  );

  // Fetch events
  const getEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await fetchBrowserSessionEvents(
        `/api/projects/${projectId}/browser-sessions/events?traceId=${traceId}`
      );

      setEvents(result.events);
      setUrlChanges(result.urlChanges);
      setTotalDuration(result.duration);
      currentUrlIndexRef.current = 0;

      if (result.urlChanges.length > 0) {
        setCurrentUrl(result.urlChanges[0].url);
      }
    } catch (e) {
      console.error("Error processing events:", e);
      setEvents([]);
      setUrlChanges([]);
      setTotalDuration(0);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, traceId]);

  // Load events when browser session is available
  useEffect(() => {
    if (hasBrowserSession) {
      // Reset states
      setEvents([]);
      setIsPlaying(false);
      setSessionTime(0);
      setTotalDuration(0);
      setCurrentUrl("");
      setUrlChanges([]);
      currentUrlIndexRef.current = 0;
      getEvents();
    }
  }, [hasBrowserSession, traceId, getEvents, setSessionTime]);

  // Initialize/update rrweb player
  useEffect(() => {
    if (!events?.length || !playerContainerRef.current || activeTab !== "browser-session") {
      if (playerRef.current) {
        playerRef.current.$destroy?.();
        playerRef.current = null;
      }
      return;
    }

    // Clean up existing player
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
          skipInactive: true,
          events,
          showController: false,
          mouseTail: false,
          width: dimensions.width || 800,
          height: dimensions.height || 600,
          speed,
        },
      });

      const eventStartTime = events[0].timestamp;

      const duration = (events[events.length - 1].timestamp - events[0].timestamp) / 1000;
      setTotalDuration(duration);

      // Player event listeners
      playerRef.current.addEventListener("ui-update-player-state", (event: any) => {
        setIsPlaying(event.payload === "playing");
      });

      playerRef.current.addEventListener("ui-update-current-time", (event: any) => {
        const newTime = event.payload / 1000; // Convert to seconds (relative time)
        setSessionTime(newTime);
        updateCurrentUrl(eventStartTime + event.payload);
      });
    } catch (e) {
      console.error("Error initializing player:", e);
    }
  }, [events, activeTab, speed, dimensions, setSessionTime, updateCurrentUrl]);

  // Handle player resizing
  useEffect(() => {
    if (!playerRef.current || !dimensions.width || !dimensions.height) return;

    try {
      playerRef.current.$set({
        width: dimensions.width,
        height: dimensions.height,
      });

      requestAnimationFrame(() => {
        playerRef.current?.triggerResize?.();
      });
    } catch (e) {
      console.error("Error resizing player:", e);
    }
  }, [dimensions.width, dimensions.height]);

  // Update player speed
  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.setSpeed(speed);
    }
  }, [speed]);

  // Event handlers
  const handlePlayPause = useCallback(() => {
    if (!playerRef.current) return;

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
      setSessionTime(time);

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
    [isPlaying, setSessionTime]
  );

  useHotkeys("space", handlePlayPause, { enabled: activeTab === "browser-session" });

  // Cleanup
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
      {/* Tab Headers */}
      <div className="h-8 border-b pl-4 flex items-center gap-0 flex-shrink-0">
        {hasBrowserSession && (
          <button
            onClick={() => setActiveTab("browser-session")}
            className={`mx-2 inline-flex items-center justify-center whitespace-nowrap border-b-2 py-1 transition-all text-sm first-of-type:ml-0 gap-2 font-medium ${
              activeTab === "browser-session"
                ? "border-secondary-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Session
          </button>
        )}

        <button
          onClick={() => setActiveTab("images")}
          className={`mx-2 inline-flex items-center justify-center whitespace-nowrap border-b-2 py-1.5 text-sm transition-all gap-2 font-medium ${
            activeTab === "images"
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
        {/* Browser Session Tab */}
        <div
          ref={browserContentRef}
          className={`h-full flex flex-col ${activeTab === "browser-session" ? "block" : "hidden"}`}
        >
          {!hasBrowserSession ? (
            <div className="flex w-full h-full gap-2 p-4 items-center justify-center">
              <div className="text-center">
                <h3 className="text-lg font-medium mb-2">No browser session</h3>
                <p className="text-sm text-muted-foreground">
                  Either there is no browser session, the session is still being processed or you have an outdated SDK
                  version.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Player Controls */}
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
                  value={sessionTime || 0}
                  onChange={handleTimelineChange}
                />
                <span className="font-mono">
                  {formatSecondsToMinutesAndSeconds(sessionTime || 0)}/
                  {formatSecondsToMinutesAndSeconds(totalDuration || 0)}
                </span>
              </div>

              {/* Current URL Display */}
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

              {/* Player Content */}
              <div className="flex-1 min-h-0">
                {isLoading && (
                  <div className="flex w-full h-full gap-2 p-4 items-center justify-center">
                    <Loader2 className="animate-spin w-4 h-4" /> Loading browser session...
                  </div>
                )}
                {!isLoading && events.length === 0 && hasBrowserSession && (
                  <div className="flex w-full h-full gap-2 p-4 items-center justify-center">
                    No browser session was recorded. Either the session is still being processed or you have an outdated
                    SDK version.
                  </div>
                )}
                {!isLoading && events.length > 0 && <div ref={playerContainerRef} className="w-full h-full" />}
              </div>
            </>
          )}
        </div>

        {/* Images Tab */}
        <div className={`h-full ${activeTab === "images" ? "block" : "hidden"}`}>
          <SpanImagesVideoPlayer traceId={traceId} spanIds={llmSpanIds} />
        </div>
      </div>
    </div>
  );
};

SessionPlayer.displayName = "SessionPlayer";

export default memo(SessionPlayer);
