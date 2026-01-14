import { type Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import Datasets from "@/components/datasets/datasets";
import { authOptions } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Datasets",
};

export default async function LogsPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/sign-in");
  }

  return <Datasets />;
}
