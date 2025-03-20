"use client";

import { createContext, PropsWithChildren, useContext, useState } from "react";

type BrowserContextType = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

export const BrowserContext = createContext<BrowserContextType>({
  open: false,
  setOpen: () => {},
});

export const useBrowserContext = () => useContext(BrowserContext);

const BrowserContextProvider = ({ children }: PropsWithChildren) => {
  const [open, setOpen] = useState(true);
  return <BrowserContext.Provider value={{ open, setOpen }}>{children}</BrowserContext.Provider>;
};

export default BrowserContextProvider;
