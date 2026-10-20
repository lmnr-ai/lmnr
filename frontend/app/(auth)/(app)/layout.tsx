import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { type PropsWithChildren } from "react";

import { AppThemeProvider } from "@/components/theme/app-theme-provider";
import { getOnboardingState } from "@/lib/actions/onboarding";
import { APP_THEME_COOKIE_NAME, isAppTheme } from "@/lib/app-theme";
import { getServerSession } from "@/lib/auth-session";

export default async function AppLayout({ children }: PropsWithChildren) {
  const session = await getServerSession();
  const saved = await getOnboardingState();
  if (saved && session && saved.userId === session.user.id) {
    return redirect("/onboarding");
  }

  const themeCookie = (await cookies()).get(APP_THEME_COOKIE_NAME)?.value;
  const initialTheme = isAppTheme(themeCookie) ? themeCookie : "dark";

  return <AppThemeProvider initialTheme={initialTheme}>{children}</AppThemeProvider>;
}
