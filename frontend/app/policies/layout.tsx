import { type PropsWithChildren } from "react";

import { LANDING_COLUMN_MAX_W } from "@/components/landing/class-names";
import Footer from "@/components/landing/footer";
import LandingHeader from "@/components/landing/header";
import { getServerSession } from "@/lib/auth-session";
import { cn } from "@/lib/utils";

// Shared chrome + typography for /policies/*. The pages themselves are plain
// semantic HTML; typography is the SAME stack the blog article uses
// (`typeset typeset-docs blog-article` + General Sans via font-sans-landing —
// see components/blog/post-content/post-layout.tsx), so policies and posts
// read identically. `blog-article` also carries the table styling.
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
        <article className="blog-article typeset typeset-docs font-sans-landing font-[460] max-w-[42em] mx-auto px-6 pt-8 md:pt-14 pb-16 [&>*:first-child]:mt-0">
          {children}
        </article>
      </main>
      <Footer className="pt-[80px]" />
    </div>
  );
}
