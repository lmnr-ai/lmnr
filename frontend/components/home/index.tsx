"use client";

import Header from "@/components/ui/header";
import { ScrollArea } from "@/components/ui/scroll-area";

import FeatureBanner from "./feature-banner";
import HomeDashboards from "./home-dashboards";
import RecentActivity from "./recent-activity";

export default function Home() {
  return (
    <>
      <Header path="home" />
      <ScrollArea className="h-full">
        <div className="flex flex-col items-center">
          <div className="max-w-[850px] w-full flex flex-col gap-[45px] py-8">
            <FeatureBanner />
            <RecentActivity />
            <HomeDashboards />
          </div>
        </div>
      </ScrollArea>
    </>
  );
}
