import { createContext, type PropsWithChildren, useContext } from "react";

// Whether this page reopens its trace and span from the URL, so the views keep their tabs and message links there.
const UrlStateContext = createContext(true);

export const useUrlState = () => useContext(UrlStateContext);

/** For hosts that open traces from in-memory state (dashboards, playground, session view, embeds): leaves the URL alone. */
export const WithoutUrlState = ({ children }: PropsWithChildren) => (
  <UrlStateContext.Provider value={false}>{children}</UrlStateContext.Provider>
);
