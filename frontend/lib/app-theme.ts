export const APP_THEME_STORAGE_KEY = "app-theme";

/** The palette actually rendered. */
export type AppTheme = "dark" | "light";

/** What the user picked; "system" follows the OS. */
export type ThemePreference = AppTheme | "system";

// Marketing, auth and public share pages keep the original dark look.
const ALWAYS_DARK_PREFIXES = ["/blog", "/article", "/pricing", "/policies", "/sign-in", "/sign-up", "/shared"];

export function isAlwaysDarkPath(pathname: string): boolean {
  return pathname === "/" || ALWAYS_DARK_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
