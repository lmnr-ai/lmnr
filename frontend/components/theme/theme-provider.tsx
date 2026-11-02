"use client";

import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import { type PropsWithChildren } from "react";

import { APP_THEME_STORAGE_KEY, type AppTheme, isAlwaysDarkPath } from "@/lib/app-theme";

/** Theme class on <html>, applied by next-themes' pre-paint script. Marketing and public pages stay dark. */
export function ThemeProvider({ children }: PropsWithChildren) {
  const pathname = usePathname();
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey={APP_THEME_STORAGE_KEY}
      forcedTheme={isAlwaysDarkPath(pathname) ? "dark" : undefined}
    >
      {children}
    </NextThemesProvider>
  );
}

/** The palette on screen. next-themes' `resolvedTheme` ignores `forcedTheme`, so prefer it here. */
export function useResolvedTheme(): AppTheme {
  const { forcedTheme, resolvedTheme } = useTheme();
  return (forcedTheme ?? resolvedTheme) === "light" ? "light" : "dark";
}
