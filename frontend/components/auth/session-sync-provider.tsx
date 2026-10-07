"use client";

import { useRouter } from "next/navigation";
import { type PropsWithChildren, useEffect } from "react";

import { signOut } from "@/lib/auth-client";
import { reset } from "@/lib/posthog";
import { withBasePath } from "@/lib/utils";

const AUTH_CHANNEL_NAME = "auth-sync-channel";
const LOGOUT_EVENT = "logout";

// Exported standalone so a page that signs out can notify other tabs WITHOUT
// mounting the listener below — an in-tab listener would receive this same
// message and race the caller's own post-logout navigation.
export const broadcastLogout = () => {
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(AUTH_CHANNEL_NAME);
    channel.postMessage({ type: LOGOUT_EVENT });
    channel.close();
  }
};

export const useSessionSync = () => {
  const router = useRouter();

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;

    const channel = new BroadcastChannel(AUTH_CHANNEL_NAME);

    channel.addEventListener("message", async (event) => {
      if (event.data.type === LOGOUT_EVENT) {
        // The originating tab already signed out, so the session is gone
        // regardless of whether this tab's signOut() call succeeds — always
        // reset PostHog and redirect.
        try {
          await signOut();
        } catch (e) {
          console.error(e);
        } finally {
          reset();
          window.location.href = withBasePath("/");
        }
      }
    });

    return () => {
      channel.close();
    };
  }, [router]);

  return { broadcastLogout };
};

const SessionSyncProvider = ({ children }: PropsWithChildren) => {
  useSessionSync();
  return <>{children}</>;
};

export default SessionSyncProvider;
