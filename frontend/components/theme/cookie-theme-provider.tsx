import { cookies } from "next/headers";
import { type PropsWithChildren } from "react";

import { AppThemeProvider } from "@/components/theme/app-theme-provider";
import { APP_THEME_COOKIE_NAME, isAppTheme } from "@/lib/app-theme";

/** Server wrapper: applies the user's saved theme. Routes outside it (marketing, sign-in, checkout) stay dark. */
export default async function CookieThemeProvider({ children }: PropsWithChildren) {
  const themeCookie = (await cookies()).get(APP_THEME_COOKIE_NAME)?.value;
  return <AppThemeProvider initialTheme={isAppTheme(themeCookie) ? themeCookie : "dark"}>{children}</AppThemeProvider>;
}
