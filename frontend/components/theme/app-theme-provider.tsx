"use client";

import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { APP_THEME_COOKIE_MAX_AGE, APP_THEME_COOKIE_NAME, type AppTheme, type ThemePreference } from "@/lib/app-theme";

interface AppThemeContextValue {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  /** The rendered palette, for JS consumers; CSS resolves "system" on its own via the `.system` class. */
  theme: AppTheme;
}

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

const THEME_CLASSES: ThemePreference[] = ["dark", "light", "system"];

function applyBodyTheme(preference: ThemePreference) {
  for (const c of THEME_CLASSES) document.body.classList.toggle(c, c === preference);
}

const LIGHT_QUERY = "(prefers-color-scheme: light)";

function subscribeToSystemTheme(onChange: () => void) {
  const query = window.matchMedia(LIGHT_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const getSystemTheme = (): AppTheme => (window.matchMedia(LIGHT_QUERY).matches ? "light" : "dark");

export function AppThemeProvider({
  children,
  initialPreference,
}: PropsWithChildren<{ initialPreference: ThemePreference }>) {
  const [preference, setPreferenceState] = useState(initialPreference);
  // Server snapshot is a guess; it only feeds JS consumers and corrects right after hydration.
  const systemTheme = useSyncExternalStore(subscribeToSystemTheme, getSystemTheme, () => "dark" as const);
  const theme = preference === "system" ? systemTheme : preference;

  useLayoutEffect(() => {
    applyBodyTheme(preference);
  }, [preference]);

  useLayoutEffect(
    () => () => {
      document.body.classList.remove(...THEME_CLASSES);
    },
    []
  );

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${APP_THEME_COOKIE_NAME}=${next}; Max-Age=${APP_THEME_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
  }, []);

  const value = useMemo(() => ({ preference, setPreference, theme }), [preference, setPreference, theme]);

  return (
    <AppThemeContext.Provider value={value}>
      <div className={`${preference} contents`}>{children}</div>
    </AppThemeContext.Provider>
  );
}

export function useAppTheme(): AppThemeContextValue {
  const context = useContext(AppThemeContext);
  if (!context) throw new Error("useAppTheme must be used within AppThemeProvider");
  return context;
}

/** For components that also render outside the provider (e.g. shared trace pages), which stay dark. */
export function useAppThemeOrDefault(): AppTheme {
  return useContext(AppThemeContext)?.theme ?? "dark";
}
