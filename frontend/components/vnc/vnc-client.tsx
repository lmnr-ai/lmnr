'use client';

import React, { useEffect, useRef, useState } from 'react';

export default function VNCClient({ url, credentials = {}, onConnect, onDisconnect, onError }:
  { url: string, credentials?: {}, onConnect: () => void, onDisconnect: () => void, onError: (error: any) => void }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<any>(null);

  useEffect(() => {
    console.log('VNCClient useEffect');
    if (!canvasRef.current) return;

    let isConnected = false;

    const initVNC = async () => {
      try {
        const NoVNC = (await import('@novnc/novnc/lib/rfb')).default;

        if (!canvasRef.current) return;

        rfbRef.current = new NoVNC(canvasRef.current, url, {
          credentials,
        });

        const handleConnect = () => {
          console.log('Connected to VNC server');
          isConnected = true;
          onConnect?.();
        };

        const handleDisconnect = () => {
          console.log('Disconnected from VNC server');
          isConnected = false;
          onDisconnect?.();
        };

        const handleError = (error: Error) => {
          console.error('VNC Error:', error);
          onError?.(error);
        };

        rfbRef.current.addEventListener('connect', handleConnect);
        rfbRef.current.addEventListener('disconnect', handleDisconnect);
        rfbRef.current.addEventListener('error', handleError);
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to initialize VNC');
        console.error('VNC initialization error:', error);
        onError?.(error);
      }
    };

    initVNC();

    return () => {
      if (rfbRef.current) {
        try {
          if (isConnected) {
            rfbRef.current.disconnect();
          }
          rfbRef.current = null;
        } catch (err) {
          console.error('Error during cleanup:', err);
        }
      }
    };
  }, [url, credentials, onConnect, onDisconnect, onError, canvasRef]);

  return (
    <div
      className={`vnc-container`.trim()}
      style={{
        width: '100%',
        height: '100%',
      }}
    >
      <div ref={canvasRef} />
    </div>
  );
}
