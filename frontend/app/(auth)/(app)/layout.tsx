import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { type PropsWithChildren } from "react";

import { getOnboardingState } from "@/lib/actions/onboarding";
import { authOptions } from "@/lib/auth";

export default async function AppLayout({ children }: PropsWithChildren) {
  const session = await getServerSession(authOptions);
  const saved = await getOnboardingState();
  if (saved && session && saved.userId === session.user.id) {
    return redirect("/onboarding");
  }
  return <>{children}</>;
}
