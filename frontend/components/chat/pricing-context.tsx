"use client";

import { SupabaseClient } from "@supabase/supabase-js";
import { createContext, PropsWithChildren, RefObject, useContext, useEffect, useMemo, useRef, useState } from "react";

import ChatPricing from "@/components/chat/chat-pricing";
import { SessionPlayerHandle } from "@/components/chat/session-player";
import { ChatUser } from "@/components/chat/types";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { createSupabaseClient } from "@/lib/supabase";

type PricingContextType = {
  open: boolean;
  handleOpen: (open: boolean) => void;
  user?: ChatUser;
  supabaseClient?: SupabaseClient;
  traceId?: string;
  handleTraceId: (id?: string) => void;
  browserSessionRef: RefObject<SessionPlayerHandle | null>;
};

const PricingContext = createContext<PricingContextType>({
  open: false,
  handleOpen: () => {},
  user: undefined,
  supabaseClient: undefined,
  traceId: undefined,
  handleTraceId: () => {},
  browserSessionRef: { current: null },
});

export const usePricingContext = () => useContext(PricingContext);

const PricingProvider = ({ children, user }: PropsWithChildren<{ user: ChatUser }>) => {
  const [open, setOpen] = useState(false);
  const [traceId, setTraceId] = useState<string | undefined>(undefined);
  const client = createSupabaseClient(user.supabaseAccessToken);
  const browserSessionRef = useRef<SessionPlayerHandle>(null);

  const value = useMemo<PricingContextType>(
    () => ({
      open,
      handleOpen: setOpen,
      user,
      supabaseClient: client,
      traceId,
      handleTraceId: setTraceId,
      browserSessionRef,
    }),
    [client, open, traceId, user]
  );

  useEffect(() => {
    setTraceId(undefined);
  }, []);
  return (
    <PricingContext.Provider value={value}>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTitle className="hidden">Upgrade your plan</DialogTitle>
        <DialogContent className="max-w-[60vw] min-h-[80vh]">
          <ChatPricing />
        </DialogContent>
      </Dialog>
      {children}
    </PricingContext.Provider>
  );
};

export default PricingProvider;
