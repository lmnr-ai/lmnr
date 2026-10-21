"use client";

import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";

import { APP_THEME_COOKIE_MAX_AGE, APP_THEME_COOKIE_NAME, type AppTheme } from "@/lib/app-theme";

interface AppThemeContextValue {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
}

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

function applyBodyTheme(theme: AppTheme) {
  document.body.classList.toggle("dark", theme === "dark");
  document.body.classList.toggle("light", theme === "light");
}

export function AppThemeProvider({ children, initialTheme }: PropsWithChildren<{ initialTheme: AppTheme }>) {
  const [theme, setThemeState] = useState(initialTheme);

  useLayoutEffect(() => {
    applyBodyTheme(theme);
  }, [theme]);

  useLayoutEffect(
    () => () => {
      document.body.classList.remove("dark", "light");
    },
    []
  );

  const setTheme = useCallback((nextTheme: AppTheme) => {
    setThemeState(nextTheme);
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${APP_THEME_COOKIE_NAME}=${nextTheme}; Max-Age=${APP_THEME_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [setTheme, theme]);

  return (
    <AppThemeContext.Provider value={value}>
      <div className={`${theme} contents`}>{children}</div>
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
