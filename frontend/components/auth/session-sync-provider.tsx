'use client';


import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { PropsWithChildren,useEffect } from 'react';


const AUTH_CHANNEL_NAME = 'auth-sync-channel';
const LOGOUT_EVENT = 'logout';

export const useSessionSync = () => {
  const router = useRouter();

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;

    const channel = new BroadcastChannel(AUTH_CHANNEL_NAME);

    channel.addEventListener('message', async (event) => {
      if (event.data.type === LOGOUT_EVENT) {
        await signOut({ callbackUrl: "/" });
      }
    });

    return () => {
      channel.close();
    };
  }, [router]);

  const broadcastLogout = () => {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(AUTH_CHANNEL_NAME);
      channel.postMessage({ type: LOGOUT_EVENT });
      channel.close();
    }
  };

  return { broadcastLogout };
};

const SessionSyncProvider = ({ children }: PropsWithChildren) =>{
  useSessionSync();
  return <>{children}</>;
};

export default SessionSyncProvider;

