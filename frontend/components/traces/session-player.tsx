'use client';

import 'rrweb-player/dist/style.css';

import { PauseIcon, PlayIcon } from '@radix-ui/react-icons';
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState, useCallback } from 'react';
import rrwebPlayer from 'rrweb-player';

import { useProjectContext } from '@/contexts/project-context';

import { Skeleton } from '../ui/skeleton';
import { formatSecondsToMinutesAndSeconds } from '@/lib/utils';

interface SessionPlayerProps {
  hasBrowserSession: boolean | null;
  traceId: string;
  width: number;
  height: number;
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
  ({ hasBrowserSession, traceId, width, height, onTimelineChange }, ref) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const playerRef = useRef<any>(null);
    const [events, setEvents] = useState<Event[]>([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [totalDuration, setTotalDuration] = useState(0);
    const [speed, setSpeed] = useState(1);
    const { projectId } = useProjectContext();

    // Add debounce timer ref
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Create debounced goto function
    const debouncedGoto = useCallback((time: number) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        if (playerRef.current) {
          try {
            playerRef.current.pause();
            playerRef.current.goto(time * 1000);
          } catch (e) {
            console.error(e);
          }
        }
      }, 100); // 10ms debounce delay
    }, []);

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
        getEvents();
      }
    }, [hasBrowserSession]);

    useEffect(() => {
      if (!events?.length || !containerRef.current || playerRef.current) return;

      try {
        playerRef.current = new rrwebPlayer({
          target: containerRef.current,
          props: {
            autoPlay: false,
            skipInactive: false,
            events,
            width,
            height,
            showController: false,
            showErrors: false,
            mouseTail: false,
            speed
          }
        });

        // Set total duration and add player listeners
        const duration = (events[events.length - 1].timestamp - events[0].timestamp) / 1000;
        setTotalDuration(duration);


        // playerRef.current.addEventListener('ui-update-player-state', (event: any) => {
        //   console.log('ui-update-player-state', event);
        //   if (event.payload === 'playing') {
        //     setIsPlaying(true);
        //   } else if (event.payload === 'paused') {
        //     setIsPlaying(false);
        //   }
        // });

        playerRef.current.addEventListener('ui-update-current-time', (event: any) => {
          setCurrentTime(event.payload / 1000);
          onTimelineChange(event.payload);
        });
      } catch (e) {
        console.error('Error initializing player:', e);
      }
    }, [events, width, height]);

    useEffect(() => {
      if (playerRef.current) {
        playerRef.current.$set({
          width,
          height,
          speed,
        });
        playerRef.current.triggerResize();
      }
    }, [width, height]);

    useEffect(() => {
      if (playerRef.current) {
        playerRef.current.setSpeed(speed);
      }
    }, [speed]);

    const handlePlayPause = () => {
      if (playerRef.current) {
        cleanupDanglingNodes();
        // try {
        if (isPlaying) {
          setIsPlaying(false);
          playerRef.current.pause();
        } else {
          setIsPlaying(true);
          playerRef.current.play();
        }
        // } catch (e) {
        //   console.error('Error in play/pause:', e);
        // }
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

    // Expose imperative methods to parent
    useImperativeHandle(ref, () => ({
      goto: (time: number) => {
        if (playerRef.current) {
          playerRef.current.pause();
          playerRef.current.goto(time * 1000, isPlaying);
          setCurrentTime(time);
        }
      }
    }), []);

    const cleanupDanglingNodes = () => {
      // Get the root element where rrweb renders
      const rootElement = playerRef.current?.wrapper;
      if (!rootElement) return;

      // Find and cleanup any dangling nodes
      const cleanup = (element: any) => {
        const childNodes = Array.from(element.childNodes);
        childNodes.forEach((node: any) => {
          try {
            if (node.parentNode !== element) {
              // Node reference is stale, remove it safely
              element.removeChild(node);
            } else {
              cleanup(node);
            }
          } catch (error) {
            // Ignore removal errors for nodes that might have already been removed
            console.debug('Cleanup skipped for node:', node);
          }
        });
      };

      cleanup(rootElement);
    }

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
        <div className="relative w-full h-full">
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
              className="flex-grow"
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
            <div className="flex flex-col h-full gap-2 p-4 justify-center items-center">
              <Skeleton className="w-full h-[50%]" />
            </div>
          )}
          {events.length > 0 && (
            <div ref={containerRef} className="w-full h-full bg-background" />
          )}
        </div>
      </>
    );
  }
);

SessionPlayer.displayName = 'SessionPlayer';

export default SessionPlayer;
