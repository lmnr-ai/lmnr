import { getServerSession } from "next-auth";
import {PropsWithChildren} from "react";

import Footer from "@/components/landing/footer";
import LandingHeader from "@/components/landing/landing-header";
import { authOptions } from "@/lib/auth";

export default async function BlogLayout({
  children,
}: PropsWithChildren) {
  const session = await getServerSession(authOptions);

  return (
    <div className="min-h-screen flex flex-col">
      <LandingHeader hasSession={session !== null && session !== undefined} />
      <main className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}

