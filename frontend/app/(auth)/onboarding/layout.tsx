import { type PropsWithChildren } from "react";

import CookieThemeProvider from "@/components/theme/cookie-theme-provider";

export default function OnboardingLayout({ children }: PropsWithChildren) {
  return <CookieThemeProvider>{children}</CookieThemeProvider>;
}
