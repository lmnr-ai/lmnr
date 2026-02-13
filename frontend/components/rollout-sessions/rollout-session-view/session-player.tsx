"use client";

import "rrweb-player/dist/style.css";
import "@/lib/styles/session-player.css";

import { PauseIcon, PlayIcon } from "@radix-ui/react-icons";
import { Loader2, X } from "lucide-react";
import { useParams } from "next/navigation";
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import rrwebPlayer from "rrweb-player";

import { useRolloutSessionStoreContext } from "@/components/rollout-sessions/rollout-session-view/rollout-session-store";
import SpanImagesVideoPlayer from "@/components/rollout-sessions/rollout-session-view/span-images-video-player";
import { fetchBrowserSessionEvents, type UrlChange } from "@/components/session-player/utils";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { formatSecondsToMinutesAndSeconds } from "@/lib/utils";

import { Slider } from "../../ui/slider";

interface SessionPlayerProps {
  hasBrowserSession?: boolean;
  traceId: string;
  llmSpanIds?: string[];
  onClose: () => void;
}

const speedOptions = [1, 2, 4, 8, 16];

const SessionPlayer = ({ hasBrowserSession, traceId, llmSpanIds = [], onClose }: SessionPlayerProps) => {
  const { projectId } = useParams();
  const { setSessionTime, sessionTime, setSessionStartTime } = useRolloutSessionStoreContext((state) => ({
    setSessionTime: state.setSessionTime,
    sessionTime: state.sessionTime,
    setSessionStartTime: state.setSessionStartTime,
  }));

  const playerContainerRef = useRef<HTMLDivElement>(null);
  const browserContentRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const currentUrlIndexRef = useRef<number>(0);

  const [events, setEvents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentUrl, setCurrentUrl] = useState("");
  const [urlChanges, setUrlChanges] = useState<UrlChange[]>([]);
  const [activeTab, setActiveTab] = useState(hasBrowserSession ? "browser-session" : "images");
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [speed, setSpeed] = useLocalStorage("session-player-speed", 1);

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
  const updateCurrentUrl = useCallback(
    (timeMs: number) => {
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
    },
    [currentUrl, findUrlIndex, urlChanges]
  );

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

        setDimensions({ width, height: height - 56 });
      }
    });

    resizeObserver.observe(browserContentRef.current);
    return () => resizeObserver.disconnect();
  }, [activeTab]);

  useEffect(() => {
    if (!hasBrowserSession) return;

    const loadEvents = async () => {
      setIsLoading(true);
      try {
        const result = await fetchBrowserSessionEvents(
          `/api/projects/${projectId}/browser-sessions/events?traceId=${traceId}`
        );
        setEvents(result.events);
        setUrlChanges(result.urlChanges);
        setDuration(result.duration);
        setSessionStartTime(result.startTime);
        if (result.urlChanges.length > 0) {
          setCurrentUrl(result.urlChanges[0].url);
        }
      } catch (error) {
        console.error("Failed to load events:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadEvents();
  }, [hasBrowserSession, traceId, projectId]);

  const lastPlayerTime = useRef<number>(0);

  useEffect(() => {
    if (playerRef.current && sessionTime !== undefined) {
      // Skip goto if this update came from the player itself (avoid feedback loop)
      if (Math.abs(sessionTime - lastPlayerTime.current) < 0.05) return;
      playerRef.current.goto(sessionTime * 1000);
    }
  }, [sessionTime]);

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

      const eventStartTime = events[0].timestamp;

      playerRef.current.addEventListener("ui-update-player-state", (event: any) => {
        setIsPlaying(event.payload === "playing");
      });

      playerRef.current.addEventListener("ui-update-current-time", (event: any) => {
        const timeInSeconds = event.payload / 1000;
        lastPlayerTime.current = timeInSeconds;
        setSessionTime(timeInSeconds);
        updateCurrentUrl(eventStartTime + event.payload);
      });
    } catch (error) {
      console.error("Failed to initialize player:", error);
    }

    return () => playerRef.current?.$destroy?.();
  }, [events, setSessionTime]);

  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.$set({
        width: dimensions.width,
        height: dimensions.height,
      });
      playerRef.current.triggerResize();
    }
  }, [dimensions.width, dimensions.height]);

  const handlePlayPause = useCallback(() => {
    if (!playerRef.current) return;

    if (isPlaying) {
      playerRef.current.pause();
    } else {
      playerRef.current.play();
    }
  }, [isPlaying]);

  const handleTimelineChange = useCallback(
    (value: number) => {
      setSessionTime(value);

      if (playerRef.current) {
        const wasPlaying = isPlaying;
        if (wasPlaying) playerRef.current.pause();

        setTimeout(() => {
          playerRef.current.goto(value * 1000);
          if (wasPlaying) playerRef.current.play();
        }, 50);
      }
    },
    [isPlaying, setSessionTime]
  );

  const handleChangeSpeed = useCallback(
    (speed: number) => {
      playerRef.current.setSpeed(speed);
      setSpeed(speed);
    },
    [setSpeed]
  );

  useHotkeys("space", handlePlayPause, { enabled: activeTab === "browser-session" });

  return (
    <div className="relative w-full h-full flex flex-col">
      <div className="h-8 border-b pl-4 flex items-center gap-0 shrink-0">
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
        <div
          ref={browserContentRef}
          className={`h-full min-w-0 overflow-hidden flex flex-col ${activeTab === "browser-session" ? "block" : "hidden"}`}
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
              <div className="flex flex-row items-center justify-center gap-2 px-3 h-8 border-b shrink-0">
                <button onClick={handlePlayPause} className="text-white py-1 rounded">
                  {isPlaying ? <PauseIcon strokeWidth={1.5} /> : <PlayIcon strokeWidth={1.5} />}
                </button>

                <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center text-white py-1 px-2 rounded text-sm">
                    {speed}x
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {speedOptions.map((speedOption) => (
                      <DropdownMenuItem key={speedOption} onClick={() => handleChangeSpeed(speedOption)}>
                        {speedOption}x
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <Slider
                  min={0}
                  step={0.1}
                  max={duration}
                  value={[sessionTime || 0]}
                  onValueChange={(value) => handleTimelineChange(value[0] as number)}
                />
                <span className="font-mono text-sm">
                  {formatSecondsToMinutesAndSeconds(sessionTime || 0)}/{formatSecondsToMinutesAndSeconds(duration)}
                </span>
              </div>

              {currentUrl && (
                <div className="flex items-center px-4 py-1 border-b shrink-0">
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

              <div className="flex-1 min-h-0 min-w-0 relative">
                {isLoading ? (
                  <div className="flex w-full h-full gap-2 p-4 items-center justify-center">
                    <Loader2 className="animate-spin w-4 h-4" /> Loading browser session...
                  </div>
                ) : !events.length ? (
                  <div className="flex w-full h-full gap-2 p-4 items-center justify-center">
                    No browser session was recorded. Either the session is still being processed or you have an outdated
                    SDK version.
                  </div>
                ) : (
                  <div ref={playerContainerRef} className="absolute inset-0 overflow-hidden" />
                )}
              </div>
            </>
          )}
        </div>

        <div className={`h-full ${activeTab === "images" ? "block" : "hidden"}`}>
          <SpanImagesVideoPlayer traceId={traceId} spanIds={llmSpanIds} />
        </div>
      </div>
    </div>
  );
};

SessionPlayer.displayName = "SessionPlayer";

export default memo(SessionPlayer);
