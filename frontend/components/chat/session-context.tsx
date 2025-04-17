"use client";

import { SupabaseClient } from "@supabase/supabase-js";
import { createContext, PropsWithChildren, RefObject, useContext, useMemo, useRef, useState } from "react";

import ChatPricing from "@/components/chat/chat-pricing";
import { SessionPlayerHandle } from "@/components/chat/session-player";
import { ChatUser } from "@/components/chat/types";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { createSupabaseClient } from "@/lib/supabase";

type SessionContextType = {
  open: boolean;
  handleOpen: (open: boolean) => void;
  user?: ChatUser;
  currentTime?: number;
  handleCurrentTime: (time?: number) => void;
  supabaseClient?: SupabaseClient;
  traceId?: string;
  handleTraceId: (id?: string) => void;
  browserSessionRef: RefObject<SessionPlayerHandle | null>;
};

const SessionContext = createContext<SessionContextType>({
  open: false,
  handleOpen: () => {},
  user: undefined,
  currentTime: undefined,
  handleCurrentTime: () => {},
  supabaseClient: undefined,
  traceId: undefined,
  handleTraceId: () => {},
  browserSessionRef: { current: null },
});

export const useSessionContext = () => useContext(SessionContext);

const SessionProvider = ({ children, user }: PropsWithChildren<{ user: ChatUser }>) => {
  const [open, setOpen] = useState(false);
  const [traceId, setTraceId] = useState<string | undefined>(undefined);
  const [currentTime, setCurrentTime] = useState<number | undefined>(undefined);
  const client = createSupabaseClient(user.supabaseAccessToken);
  const browserSessionRef = useRef<SessionPlayerHandle>(null);

  const value = useMemo<SessionContextType>(
    () => ({
      open,
      handleOpen: setOpen,
      user,
      supabaseClient: client,
      traceId,
      handleTraceId: setTraceId,
      browserSessionRef,
      currentTime,
      handleCurrentTime: setCurrentTime,
    }),
    [client, currentTime, open, traceId, user]
  );

  return (
    <SessionContext.Provider value={value}>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTitle className="hidden">Upgrade your plan</DialogTitle>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <ChatPricing />
        </DialogContent>
      </Dialog>
      {children}
    </SessionContext.Provider>
  );
};

export default SessionProvider;
