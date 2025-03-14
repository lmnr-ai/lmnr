'use client';

import 'rrweb-player/dist/style.css';

import { PauseIcon, PlayIcon } from '@radix-ui/react-icons';
import { Loader2 } from 'lucide-react';
import pako from 'pako';
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import rrwebPlayer from 'rrweb-player';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProjectContext } from '@/contexts/project-context';
import { formatSecondsToMinutesAndSeconds } from '@/lib/utils';


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

const SessionPlayer = forwardRef<SessionPlayerHandle, SessionPlayerProps>(
  ({
    hasBrowserSession,
    traceId,
    onTimelineChange
  }, ref) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const playerContainerRef = useRef<HTMLDivElement | null>(null);
    const playerRef = useRef<any>(null);
    const [events, setEvents] = useState<Event[]>([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [totalDuration, setTotalDuration] = useState(0);
    const [speed, setSpeed] = useState(1);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [startTime, setStartTime] = useState(0);
    const { projectId } = useProjectContext();
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Add resize observer effect
    useEffect(() => {
      if (!containerRef.current) return;

      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          setDimensions({ width, height: height - 48 }); // Subtract header height (48px)
        }
      });

      resizeObserver.observe(containerRef.current);

      return () => resizeObserver.disconnect();
    }, []);

    const getEvents = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/projects/${projectId}/browser-sessions/events?traceId=${traceId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No reader available');

        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }

        const blob = new Blob(chunks, { type: 'application/json' });
        const text = await blob.text();

        let batchEvents = [];
        try {
          batchEvents = JSON.parse(text);
        } catch (e) {
          console.error('Error parsing events:', e);
          setIsLoading(false);
          setEvents([]);
          return;
        }

        const events = batchEvents.flatMap((batch: any) => batch.map((data: any) => {
          const parsedEvent = JSON.parse(data.text);
          const base64DecodedData = atob(parsedEvent.data);
          let decompressedData = null;

          try {
            const encodedData = new Uint8Array(base64DecodedData.split('').map((c: any) => c.charCodeAt(0)));
            decompressedData = pako.ungzip(encodedData, { to: 'string' });
          } catch (e) {
            // old non-compressed events
            decompressedData = base64DecodedData;
          }

          const event = {
            ...parsedEvent,
            data: JSON.parse(decompressedData)
          };

          return {
            data: event.data,
            timestamp: new Date(event.timestamp).getTime(),
            type: parseInt(event.event_type)
          };
        }));

        setEvents(events);
      } catch (e) {
        console.error('Error processing events:', e);
      } finally {
        setIsLoading(false);
      }
    };

    useEffect(() => {
      if (hasBrowserSession) {
        setEvents([]);
        setIsPlaying(false);
        setCurrentTime(0);
        setTotalDuration(0);
        setSpeed(1);
        getEvents();
      }
    }, [hasBrowserSession, traceId]);

    useEffect(() => {
      if (!events?.length || !playerContainerRef.current) return;

      try {
        playerRef.current = new rrwebPlayer({
          target: playerContainerRef.current,
          props: {
            autoPlay: false,
            skipInactive: false,
            events,
            showController: false,
            mouseTail: false,
            width: dimensions.width,
            height: dimensions.height,
            speed
          }
        });
        const startTime = events[0].timestamp;
        setStartTime(startTime);

        const duration = (events[events.length - 1].timestamp - events[0].timestamp) / 1000;
        setTotalDuration(duration);

        playerRef.current.addEventListener('ui-update-player-state', (event: any) => {
          if (event.payload === 'playing') {
            setIsPlaying(true);
          } else if (event.payload === 'paused') {
            setIsPlaying(false);
          }
        });

        playerRef.current.addEventListener('ui-update-current-time', (event: any) => {
          setCurrentTime(event.payload / 1000);
          onTimelineChange(startTime + event.payload);
        });
      } catch (e) {
        console.error('Error initializing player:', e);
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

    const handlePlayPause = () => {
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
          console.error('Error in play/pause:', e);
        }
      }
    };

    const handleTimelineChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
    };

    const handleSpeedChange = (newSpeed: number) => {
      setSpeed(newSpeed);
    };

    useImperativeHandle(ref, () => ({
      goto: (time: number) => {
        if (playerRef.current) {
          setCurrentTime(time);
          playerRef.current.goto(time * 1000);
        }
      }
    }), []);

    return (
      <>
        <style jsx global>{`
          .rr-player {
            background-color: transparent !important;
            border-radius: 6px;
          }
          
          .replayer-wrapper {
            background-color: transparent !important;
            border: 1px solid gray !important;
          }

          .rr-controller {
            background-color: transparent !important;
            color: white !important;
            text-color: white !important;
          }

          /* Using the provided cursor SVG with white outline */
          .replayer-mouse {
            width: 30px !important;
            height: 42px !important;
            background-image: url("data:image/svg+xml,%3Csvg width='15' height='21' viewBox='0 0 15 21' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M5.21818 14.9087L5.05222 14.9637L4.92773 15.0865L0.75 19.2069V1.84143L13.2192 14.6096H6.24066H6.11948L6.00446 14.6477L5.21818 14.9087Z' fill='black' stroke='white' stroke-width='1.5'/%3E%3C/svg%3E") !important;
            background-size: contain !important;
            background-repeat: no-repeat !important;
            background-color: transparent !important;
            margin-left: -1px !important;
            margin-top: -1px !important;
            transition: all 0.2s ease-in-out !important;
          }

          @keyframes bounce {
            0%, 100% {
              transform: scale(1);
            }
            50% {
              transform: scale(1.4);
            }
          }

          .replayer-mouse.active {
            animation: bounce 0.3s ease-in-out !important;
          }
        `}</style>
        <div className="relative w-full h-full" ref={containerRef}>
          <div className="flex flex-row items-center justify-center gap-2 px-4 h-12 border-b">
            <button
              onClick={handlePlayPause}
              className="text-white py-1 rounded"
            >
              {isPlaying ? <PauseIcon strokeWidth={1.5} /> : <PlayIcon strokeWidth={1.5} />}
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center text-white py-1 px-2 rounded text-sm">
                {speed}x
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {[1, 2, 4, 8].map((speedOption) => (
                  <DropdownMenuItem
                    key={speedOption}
                    onClick={() => handleSpeedChange(speedOption)}
                  >
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
              {formatSecondsToMinutesAndSeconds(currentTime || 0)}/{formatSecondsToMinutesAndSeconds(totalDuration || 0)}
            </span>
          </div>
          {isLoading && (
            <div className="flex w-full h-full gap-2 p-4 items-center justify-center -mt-12">
              <Loader2 className="animate-spin w-4 h-4" /> Loading browser session...
            </div>
          )}
          {!isLoading && events.length === 0 && hasBrowserSession && (
            <div className="flex w-full h-full gap-2 p-4 items-center justify-center -mt-12">
              No browser session was recorded. This might be due to an outdated SDK version.
            </div>
          )}
          {!isLoading && events.length > 0 && (
            <div ref={playerContainerRef} />
          )}
        </div>
      </>
    );
  }
);

SessionPlayer.displayName = 'SessionPlayer';

export default SessionPlayer;
