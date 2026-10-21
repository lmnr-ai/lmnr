export const APP_THEME_COOKIE_NAME = "app-theme";
export const APP_THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** The palette actually rendered. */
export type AppTheme = "dark" | "light";

/** What the user picked; "system" follows the OS. */
export type ThemePreference = AppTheme | "system";

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";

export function isThemePreference(value: string | undefined): value is ThemePreference {
  return value === "dark" || value === "light" || value === "system";
}

/** Client-side read for pages rendered outside the (auth) layout, e.g. root error boundaries. */
export function readThemePreferenceCookie(): ThemePreference {
  if (typeof document === "undefined") return DEFAULT_THEME_PREFERENCE;
  const value = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${APP_THEME_COOKIE_NAME}=`))
    ?.split("=")[1];
  return isThemePreference(value) ? value : DEFAULT_THEME_PREFERENCE;
}
