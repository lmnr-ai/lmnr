export const APP_THEME_COOKIE_NAME = "app-theme";
export const APP_THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type AppTheme = "dark" | "light";

export function isAppTheme(value: string | undefined): value is AppTheme {
  return value === "dark" || value === "light";
}

/** Client-side read for pages rendered outside the (app) layout, e.g. root error boundaries. */
export function readAppThemeCookie(): AppTheme {
  if (typeof document === "undefined") return "dark";
  const value = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${APP_THEME_COOKIE_NAME}=`))
    ?.split("=")[1];
  return isAppTheme(value) ? value : "dark";
}
