import { type PropsWithChildren } from "react";

import CookieThemeProvider from "@/components/theme/cookie-theme-provider";

export default function InvitationsLayout({ children }: PropsWithChildren) {
  return <CookieThemeProvider>{children}</CookieThemeProvider>;
}
