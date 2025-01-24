'use client';

import 'rrweb-player/dist/style.css';

import React, { useEffect, useRef } from 'react';
import rrwebPlayer from 'rrweb-player';

interface SessionPlayerProps {
  events: any[];
}

const SessionPlayer = ({ events }: SessionPlayerProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    // If there's no container or events are empty, do nothing.
    if (!events?.length || !containerRef.current) return;

    // If we already created a playerRef, do nothing.
    if (playerRef.current) return;

    const processedEvents = events.map(event => {
      if (event.data && typeof event.data === 'string') {

        return {
          data: JSON.parse(event.data),
          timestamp: new Date(event.timestamp).getTime(),
          type: parseInt(event.event_type)
        };
      }
      return event;
    });

    playerRef.current = new rrwebPlayer({
      target: containerRef.current,
      props: {
        events: processedEvents,
      },
    });

  }, [events]);

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div ref={containerRef} className="w-full rounded-lg" />
    </div>
  );
};

export default SessionPlayer;