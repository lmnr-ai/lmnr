'use client';

import 'rrweb-player/dist/style.css';

import React, { useEffect, useRef, useState } from 'react';
import rrwebPlayer from 'rrweb-player';
import { useProjectContext } from '@/contexts/project-context';

interface SessionPlayerProps {
  traceId: string;
}

interface Event {
  data: any;
  timestamp: string;
  event_type: number;
}

const SessionPlayer = ({ traceId }: SessionPlayerProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const [events, setEvents] = useState<Event[]>([]);
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
  }

  useEffect(() => {
    getEvents();
  }, []);

  useEffect(() => {
    // If there's no container or events are empty, do nothing.
    if (!events?.length || !containerRef.current) return;

    // If we already created a playerRef, do nothing.
    if (playerRef.current) return;

    playerRef.current = new rrwebPlayer({
      target: containerRef.current,
      props: {
        events,
      },
    });

  }, [events]);

  return (
    <div ref={containerRef} className="w-full h-full" />
  );
};

export default SessionPlayer;