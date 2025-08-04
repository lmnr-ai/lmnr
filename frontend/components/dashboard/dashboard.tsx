"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import GridLayout from "@/components/dashboard/grid-layout";
import { Button } from "@/components/ui/button";

import DateRangeFilter from "../ui/date-range-filter";
import { GroupByPeriodSelect } from "../ui/group-by-period-select";
import Header from "../ui/header";
import { ScrollArea } from "../ui/scroll-area";

export default function Dashboard() {
  const params = useParams();
  const projectId = params?.projectId as string;

  const searchParams = useSearchParams();
  const pastHours = searchParams.get("pastHours") || undefined;
  const startDate = searchParams.get("startDate") || undefined;
  const endDate = searchParams.get("endDate") || undefined;

  const router = useRouter();

  useEffect(() => {
    if (!pastHours && !startDate && !endDate) {
      const sp = new URLSearchParams(searchParams);
      sp.set("pastHours", "24");
      router.replace(`/project/${projectId}/dashboard?${sp.toString()}`);
    }
  }, []);

  return (
    <>
      <Header path={"dashboard"}>
        <div className="h-12 flex gap-2 w-full items-center">
          <DateRangeFilter />
          <GroupByPeriodSelect />
          <Link passHref className="ml-auto mr-2" href={{ pathname: "dashboard/new" }}>
            <Button variant="outlinePrimary">New Chart</Button>
          </Link>
        </div>
      </Header>
      <ScrollArea className="h-full">
        <div className="h-full p-4">
          <GridLayout />
        </div>
      </ScrollArea>
    </>
  );
}
