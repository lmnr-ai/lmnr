import { type PropsWithChildren } from "react";

import { LANDING_COLUMN_MAX_W } from "@/components/landing/class-names";
import Footer from "@/components/landing/footer";
import LandingHeader from "@/components/landing/header";
import { getServerSession } from "@/lib/auth-session";
import { cn } from "@/lib/utils";

export default async function BlogLayout({ children }: PropsWithChildren) {
  const session = await getServerSession();

  return (
    <div className="min-h-screen flex flex-col bg-surface-700">
      <LandingHeader
        hasSession={session !== null && session !== undefined}
        isIncludePadding
        className={cn("w-full mx-auto pt-4 px-6 lg:px-0", LANDING_COLUMN_MAX_W)}
      />
      <main className="flex-1">{children}</main>
      <Footer className="pt-[160px]" />
    </div>
  );
}
