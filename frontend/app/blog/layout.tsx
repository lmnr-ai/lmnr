import { getServerSession } from "next-auth";
import { type PropsWithChildren } from "react";

import Footer from "@/components/Landing/footer";
import LandingHeader from "@/components/Landing/header";
import { authOptions } from "@/lib/auth";

export default async function BlogLayout({ children }: PropsWithChildren) {
  const session = await getServerSession(authOptions);

  return (
    <div className="min-h-screen flex flex-col">
      <LandingHeader hasSession={session !== null && session !== undefined} />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
