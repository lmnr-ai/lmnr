import { getServerSession } from "next-auth";
import { type PropsWithChildren } from "react";

import Footer from "@/components/landing/footer";
import LandingHeader from "@/components/landing/header";
import { authOptions } from "@/lib/auth";

export default async function BlogLayout({ children }: PropsWithChildren) {
  const session = await getServerSession(authOptions);

  return (
    <div className="min-h-screen flex flex-col">
      <LandingHeader hasSession={session !== null && session !== undefined} isIncludePadding />
      <main className="flex-1">{children}</main>
      {/* Spacer */}
      <div className="w-full h-[160px]" />
      <Footer className="pt-[160px]" />
    </div>
  );
}
