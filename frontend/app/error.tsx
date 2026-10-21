"use client"; // Error components must be Client Components

import ErrorPage from "@/components/error/error-page";
import { AppThemeProvider } from "@/components/theme/app-theme-provider";
import { readThemePreferenceCookie } from "@/lib/app-theme";

// Root boundary renders outside the (auth) layout's theme provider, so it reads the cookie itself.
export default function Error({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <AppThemeProvider initialPreference={readThemePreferenceCookie()}>
      <ErrorPage error={error} backAction={() => window.history.back()} backLabel="Back" />
    </AppThemeProvider>
  );
}
