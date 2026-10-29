import { type Metadata } from "next";
import { notFound } from "next/navigation";

import EvalTableSandbox from "@/components/sandbox/eval-table";

export const metadata: Metadata = { title: "Eval table sandbox" };

// Mock-data playground for the eval table's UI states; never served in production.
export default function SandboxPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <EvalTableSandbox />;
}
