'use client';

import 'rrweb-player/dist/style.css';

import { PauseIcon, PlayIcon } from '@radix-ui/react-icons';
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import rrwebPlayer from 'rrweb-player';

import { useProjectContext } from '@/contexts/project-context';

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
    const { projectId } = useProjectContext();

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
      if (!events?.length || !containerRef.current) return;
      if (playerRef.current) return;

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
          mouseTail: false, // Disable default mouse tail
          // // Remove the custom mouse properties as they're not valid options
          // plugins: [{
          //   name: 'mouse',
          //   options: {
          //     cursor: true,
          //     clickElement: true,
          //     tail: {
          //       duration: 800,
          //       style: 'red',
          //       lineCap: 'round',
          //       lineWidth: 3,
          //       radius: 4
          //     }
          //   }
          // }]
        }
      });

      // Set total duration and add player listeners
      const duration = (events[events.length - 1].timestamp - events[0].timestamp) / 1000;
      setTotalDuration(duration);

      playerRef.current.addEventListener('ui-update-current-time', (event: any) => {
        setCurrentTime(event.payload / 1000);
        onTimelineChange(event.payload);
      });
    }, [events, width, height]);

    useEffect(() => {
      if (playerRef.current) {
        playerRef.current.$set({
          width,
          height,
        });
        playerRef.current.triggerResize();
      }
    }, [width, height]);

    const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handlePlayPause = () => {
      if (playerRef.current) {
        if (isPlaying) {
          playerRef.current.pause();
        } else {
          playerRef.current.play();
        }
        setIsPlaying((playing) => !playing);
      }
    };

    const handleTimelineChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (playerRef.current) {
        const time = parseFloat(e.target.value);
        try {
          playerRef.current.goto(time * 1000);
        } catch (e) {
          console.error(e);
        }
      }
    };

    // Expose imperative methods to parent
    useImperativeHandle(ref, () => ({
      goto: (time: number) => {
        if (playerRef.current) {
          playerRef.current.goto(time * 1000);
          setCurrentTime(time);
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
        <div className="relative w-full h-full">
          <div className="flex flex-row items-center justify-center gap-2 px-4 h-12 border-b">
            <button
              onClick={handlePlayPause}
              className="text-white py-1 rounded"
            >
              {isPlaying ? <PauseIcon strokeWidth={1.5} /> : <PlayIcon strokeWidth={1.5} />}
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
            <span className="time-display">
              {formatTime(currentTime)} / {formatTime(totalDuration)}
            </span>
          </div>
          <div ref={containerRef} className="w-full h-full bg-background" />
        </div>
      </>
    );
  }
);

SessionPlayer.displayName = 'SessionPlayer';

export default SessionPlayer;
