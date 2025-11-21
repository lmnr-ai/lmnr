import { Metadata } from "next";

import PatternsTable from "@/components/patterns";
import Header from "@/components/ui/header";

export const metadata: Metadata = {
  title: "Patterns",
};

export default async function PatternsPage() {
  return (
    <>
      <Header path="patterns" />
      <div className="flex flex-col overflow-hidden">
        <PatternsTable />
      </div>
    </>
  );
}

