import { createContext, useContext } from "react";

/**
 * True while the user is hovering the SignalEventsPanel (after the open delay).
 * Used by the panel toolbar to slide in/out and could be used by other internal
 * components that should react to panel hover.
 */
export const PanelHoverContext = createContext<boolean>(false);

export const usePanelHover = () => useContext(PanelHoverContext);
