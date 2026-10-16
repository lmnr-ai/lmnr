import { type PropsWithChildren } from "react";

import AnnouncementBanner from "@/components/landing/announcement-banner";
import { LANDING_COLUMN_MAX_W } from "@/components/landing/class-names";
import Footer from "@/components/landing/footer";
import LandingHeader from "@/components/landing/header";
import { getServerSession } from "@/lib/auth-session";
import { cn } from "@/lib/utils";

export default async function BlogLayout({ children }: PropsWithChildren) {
  const session = await getServerSession();

  return (
    <div className="min-h-screen flex flex-col bg-surface-150">
      <div className="sticky top-0 z-50 w-full">
        <AnnouncementBanner />
        {/* Solid behind the banner and header, fading only in the overhang below, so content dissolves
            under the header instead of hitting a hard edge or showing through it. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -bottom-6 -z-10 bg-linear-to-b from-surface-150 from-[calc(100%-1.5rem)] to-transparent"
        />
        <LandingHeader
          hasSession={session !== null && session !== undefined}
          isIncludePadding
          isShowMobileNav
          className={cn("w-full mx-auto pt-4 px-6 lg:px-0", LANDING_COLUMN_MAX_W)}
        />
      </div>
      <main className="flex-1">{children}</main>
      <Footer className="pt-[160px]" />
    </div>
  );
}
