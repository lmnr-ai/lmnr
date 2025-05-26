"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Resizable } from "re-resizable";
import { createContext, Dispatch, PropsWithChildren, SetStateAction, useContext, useMemo, useState } from "react";

import SQLEditor from "@/components/sql/editor";

type SQLEditorContextType = {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
};

const SQLEditorContext = createContext<SQLEditorContextType>({
  open: false,
  setOpen: () => {
    throw new Error("Cannot call setOpen outside of SQLEditorProvider");
  },
});

export const useSQLEditorContext = () => useContext(SQLEditorContext);

const SQLEditorProvider = ({ children }: PropsWithChildren) => {
  const [open, setOpen] = useState(false);

  const value = useMemo<SQLEditorContextType>(
    () => ({
      open,
      setOpen,
    }),
    [open]
  );

  return (
    <SQLEditorContext.Provider value={value}>
      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute top-0 right-0 bottom-0 bg-background z-50 flex"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{
              type: "tween",
              duration: 0.3,
              ease: "easeInOut",
            }}
          >
            <Resizable
              className="border-l"
              enable={{
                left: true,
              }}
              minWidth="20vw"
              maxWidth="91vw"
              defaultSize={{
                width: "50vw",
              }}
            >
              <SQLEditor />
            </Resizable>
          </motion.div>
        )}
      </AnimatePresence>
      {children}
    </SQLEditorContext.Provider>
  );
};

export default SQLEditorProvider;
