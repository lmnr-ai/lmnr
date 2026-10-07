import { redirect } from "next/navigation";
import { type PropsWithChildren } from "react";

import { getOnboardingState } from "@/lib/actions/onboarding";
import { getServerSession } from "@/lib/auth-session";

export default async function AppLayout({ children }: PropsWithChildren) {
  const session = await getServerSession();
  const saved = await getOnboardingState();
  if (saved && session && saved.userId === session.user.id) {
    return redirect("/onboarding");
  }
  return <>{children}</>;
}
