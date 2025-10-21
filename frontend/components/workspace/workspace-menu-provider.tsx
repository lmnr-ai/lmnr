"use client";

import { createContext, PropsWithChildren, useContext, useState } from "react";

export type WorkspaceMenu = "projects" | "usage" | "team" | "settings";
type WorkspaceMenuContextType = {
  menu: WorkspaceMenu;
  setMenu: (menu: WorkspaceMenu) => void;
};

const WorkspaceMenuContext = createContext<WorkspaceMenuContextType>({ menu: "usage", setMenu: () => {} });

const WorkspaceMenuProvider = ({ children }: PropsWithChildren) => {
  const [menu, setMenu] = useState<WorkspaceMenu>("projects");
  return <WorkspaceMenuContext.Provider value={{ menu, setMenu }}>{children}</WorkspaceMenuContext.Provider>;
};

export const useWorkspaceMenuContext = () => useContext<WorkspaceMenuContextType>(WorkspaceMenuContext);

export default WorkspaceMenuProvider;
