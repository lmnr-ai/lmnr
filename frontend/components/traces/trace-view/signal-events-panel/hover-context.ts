import { createContext, useContext } from "react";

/** True iff the panel is currently in the hover-expanded variant (the
 *  HoverCardContent portal). Trigger/base render with `false`. Components like
 *  the toolbar use this to know whether to be visible. */
export const PanelHoverContext = createContext<boolean>(false);

export const usePanelHover = () => useContext(PanelHoverContext);
