export const APP_THEME_COOKIE_NAME = "app-theme";
export const APP_THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type AppTheme = "dark" | "light";

export function isAppTheme(value: string | undefined): value is AppTheme {
  return value === "dark" || value === "light";
}
