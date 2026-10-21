import { cookies } from "next/headers";
import { type PropsWithChildren } from "react";

import { AppThemeProvider } from "@/components/theme/app-theme-provider";
import { APP_THEME_COOKIE_NAME, DEFAULT_THEME_PREFERENCE, isThemePreference } from "@/lib/app-theme";

/** Server wrapper: applies the user's saved theme. Mounted on the (auth) layout; routes outside it (marketing, sign-in, shared pages) stay dark. */
export default async function CookieThemeProvider({ children }: PropsWithChildren) {
  const themeCookie = (await cookies()).get(APP_THEME_COOKIE_NAME)?.value;
  const initialPreference = isThemePreference(themeCookie) ? themeCookie : DEFAULT_THEME_PREFERENCE;
  return <AppThemeProvider initialPreference={initialPreference}>{children}</AppThemeProvider>;
}
