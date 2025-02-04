'use client';

import 'rrweb-player/dist/style.css';

import { PauseIcon, PlayIcon } from '@radix-ui/react-icons';
import { Loader2 } from 'lucide-react';
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import rrwebPlayer from 'rrweb-player';

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
    const workerRef = useRef<Worker | null>(null);

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

    // Add debounce timer ref
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Initialize worker
    useEffect(() => {
      workerRef.current = new Worker(new URL('@/lib/workers/player-worker.ts', import.meta.url));

      workerRef.current.onmessage = (e) => {
        const { result, isPlaying } = e.data;
        if (playerRef.current) {
          try {
            playerRef.current.goto(result, isPlaying);
          } catch (e) {
            console.error(e);
          }
        }
      };

      return () => {
        workerRef.current?.terminate();
      };
    }, []);

    // Update the debouncedGoto function
    const debouncedGoto = useCallback((time: number) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        workerRef.current?.postMessage({ time, isPlaying });
      }, 50);
    }, [isPlaying]);

    const getEvents = async () => {
      const res = await fetch(`/api/projects/${projectId}/browser-sessions/events?traceId=${traceId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      try {
        const events = await res.json();
        const processedEvents = events.map((event: any) => {
          if (event.data && typeof event.data === 'string') {
            return {
              data: JSON.parse(event.data),
              timestamp: new Date(event.timestamp).getTime(),
              type: parseInt(event.event_type)
            };
          }
          return event;
        });

        setEvents(processedEvents);
      } catch (e) {
        console.error(e);
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

        // Set total duration and add player listeners
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
      setCurrentTime(time); // Update UI immediately
      debouncedGoto(time); // Debounce the actual goto call
    };

    const toggleSpeed = () => {
      setSpeed((currentSpeed) => (currentSpeed === 1 ? 2 : 1));
    };

    // Update the imperative handle
    useImperativeHandle(ref, () => ({
      goto: (time: number) => {
        if (playerRef.current) {
          setCurrentTime(time);
          workerRef.current?.postMessage({ time, isPlaying });
        }
      }
    }), [isPlaying]);

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
            <button
              onClick={toggleSpeed}
              className="text-white py-1 px-2 rounded text-sm"
            >
              {speed}x
            </button>
            <input
              type="range"
              className="flex-grow cursor-pointer"
              min="0"
              step="0.1"
              max={totalDuration}
              value={currentTime}
              onChange={handleTimelineChange}
            />
            <span className="font-mono">
              {formatSecondsToMinutesAndSeconds(currentTime)}/{formatSecondsToMinutesAndSeconds(totalDuration)}
            </span>
          </div>
          {events.length === 0 && (
            <div className="flex w-full h-full gap-2 p-4 items-center justify-center -mt-12">
              <Loader2 className="animate-spin w-4 h-4" /> Loading browser session...
            </div>
          )}
          {events.length > 0 && (
            <div ref={playerContainerRef} />
          )}
        </div>
      </>
    );
  }
);

SessionPlayer.displayName = 'SessionPlayer';

export default SessionPlayer;
