'use client';

import 'rrweb-player/dist/style.css';

import { PauseIcon, PlayIcon } from '@radix-ui/react-icons';
import React, { useEffect, useRef, useState } from 'react';
import rrwebPlayer from 'rrweb-player';

import { useProjectContext } from '@/contexts/project-context';

interface SessionPlayerProps {
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

const SessionPlayer = ({ traceId, width, height, onTimelineChange }: SessionPlayerProps) => {
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
    getEvents();
  }, []);

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
      }
    });

    // Set total duration and add player listeners
    const duration = (events[events.length - 1].timestamp - events[0].timestamp) / 1000;
    setTotalDuration(duration);

    playerRef.current.addEventListener('ui-update-current-time', (event: any) => {
      setCurrentTime(event.payload / 1000);
      onTimelineChange(event.payload);
    });
  }, [events]);

  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.$set({
        width,
        height,
      });
      playerRef.current.triggerResize();
    }
  }, [playerRef.current, width, height]);

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
      console.log('isPlaying', isPlaying);
      setIsPlaying((playing) => !playing);

    }
  };

  const handleTimelineChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (playerRef.current) {
      const time = parseFloat(e.target.value);
      playerRef.current.goto(time * 1000);
    }
  };

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
      `}</style>
      <div className="relative w-full h-full">
        <div className="flex flex-row items-center justify-center gap-2 px-2 h-12 border-b">
          <button
            onClick={handlePlayPause}
            className="text-white px-2 py-1 rounded"
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          <input
            type="range"
            className="flex-grow"
            min="0"
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
};

export default SessionPlayer;
