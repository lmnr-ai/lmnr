import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { type PropsWithChildren } from "react";

import { authOptions } from "@/lib/auth";

export default async function AuthLayout({ children }: PropsWithChildren) {
  const session = await getServerSession(authOptions);
  if (!session) {
    // Preserve the deep-linked URL so the user lands back on the same page after
    // sign-in (e.g. `/oauth/device?user_code=...`). `proxy.ts` forwards the
    // current pathname+search in `x-pathname` — Server Component layouts can't
    // read the request URL otherwise.
    const h = await headers();
    const pathname = h.get("x-pathname");
    const callback = pathname && pathname.startsWith("/") ? pathname : null;
    return redirect(callback ? `/sign-in?callbackUrl=${encodeURIComponent(callback)}` : "/sign-in");
  }
  return <>{children}</>;
}
