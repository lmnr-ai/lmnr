import { type PropsWithChildren } from "react";

import { LANDING_COLUMN_MAX_W } from "@/components/landing/class-names";
import Footer from "@/components/landing/footer";
import LandingHeader from "@/components/landing/header";
import { getServerSession } from "@/lib/auth-session";
import { cn } from "@/lib/utils";

// Shared chrome + typography for /policies/*. The pages themselves are plain
// semantic HTML; `prose` is what gives headings/lists/tables their styling
// (Tailwind preflight otherwise strips it).
export default async function PoliciesLayout({ children }: PropsWithChildren) {
  const session = await getServerSession();

  return (
    <div className="min-h-screen flex flex-col bg-surface-700">
      <LandingHeader
        hasSession={session !== null && session !== undefined}
        isIncludePadding
        className={cn("w-full mx-auto pt-4 px-6 lg:px-0", LANDING_COLUMN_MAX_W)}
      />
      <main className="flex-1">
        <article className="prose prose-invert prose-headings:scroll-mt-24 max-w-3xl mx-auto px-6 py-12">
          {children}
        </article>
      </main>
      <Footer className="pt-[80px]" />
    </div>
  );
}
