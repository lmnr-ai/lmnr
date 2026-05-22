import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { type PropsWithChildren } from "react";

import { authOptions } from "@/lib/auth";

export default async function AuthLayout({ children }: PropsWithChildren) {
  const session = await getServerSession(authOptions);
  if (!session) return redirect("/sign-in");
  return <>{children}</>;
}
