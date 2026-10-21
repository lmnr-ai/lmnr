import { redirect } from "next/navigation";
import { type PropsWithChildren } from "react";

import CookieThemeProvider from "@/components/theme/cookie-theme-provider";
import { getServerSession } from "@/lib/auth-session";

export default async function AuthLayout({ children }: PropsWithChildren) {
  const session = await getServerSession();
  if (!session) return redirect("/sign-in");
  return <CookieThemeProvider>{children}</CookieThemeProvider>;
}
