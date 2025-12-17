"use client";

import Link from "next/link";

import GridLayout from "@/components/dashboard/grid-layout";
import { Button } from "@/components/ui/button";

import DateRangeFilter from "../ui/date-range-filter";
import { GroupByPeriodSelect } from "../ui/group-by-period-select";
import Header from "../ui/header";
import { ScrollArea } from "../ui/scroll-area";

export default function Dashboard() {
  return (
    <>
      <Header path={"dashboard"}>
        <div className="h-12 flex gap-2 w-full items-center">
          <DateRangeFilter />
          <GroupByPeriodSelect />
          <Link passHref className="ml-auto" href={{ pathname: "dashboard/new" }}>
            <Button icon="plus">Chart</Button>
          </Link>
        </div>
      </Header>
      <ScrollArea className="h-full">
        <div className="h-full px-4 pb-4">
          <GridLayout />
        </div>
      </ScrollArea>
    </>
  );
}
