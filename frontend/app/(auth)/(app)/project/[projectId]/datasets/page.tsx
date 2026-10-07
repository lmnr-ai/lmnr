import { type Metadata } from "next";
import { redirect } from "next/navigation";

import Datasets from "@/components/datasets/datasets";
import { getServerSession } from "@/lib/auth-session";

export const metadata: Metadata = {
  title: "Datasets",
};

export default async function LogsPage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  return <Datasets />;
}
