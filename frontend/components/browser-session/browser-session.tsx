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
    if (!events?.length || !containerRef.current) return;

    const processedEvents = events.map(event => {
      if (event.data && typeof event.data === 'string') {
        return {
          ...event,
          timestamp: new Date(event.timestamp).getTime(),
          data: JSON.parse(event.data)
        };
      }
      return event;
    });

    playerRef.current = new rrwebPlayer({
      target: containerRef.current,
      props: {
        events: processedEvents,
        width: 1024,
        height: 576,
      },
    });

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
      }
    };
  }, [events]);

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div ref={containerRef} className="w-full rounded-lg" />
    </div>
  );
};

export default SessionPlayer;