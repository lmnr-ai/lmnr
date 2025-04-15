"use client";

import { SupabaseClient } from "@supabase/supabase-js";
import { createContext, PropsWithChildren, useContext, useMemo, useState } from "react";

import ChatPricing from "@/components/chat/chat-pricing";
import { ChatUser } from "@/components/chat/types";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { createSupabaseClient } from "@/lib/supabase";

type PricingContextType = {
  open: boolean;
  handleOpen: (open: boolean) => void;
  user?: ChatUser;
  supabaseClient?: SupabaseClient;
};

const PricingContext = createContext<PricingContextType>({
  open: false,
  handleOpen: () => {},
  user: undefined,
  supabaseClient: undefined,
});

export const usePricingContext = () => useContext(PricingContext);

const PricingProvider = ({ children, user }: PropsWithChildren<{ user: ChatUser }>) => {
  const [open, setOpen] = useState(false);

  const client = createSupabaseClient(user.supabaseAccessToken);

  const value = useMemo<PricingContextType>(
    () => ({
      open,
      handleOpen: setOpen,
      user,
      supabaseClient: client,
    }),
    [client, open, user]
  );

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
