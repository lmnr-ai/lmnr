import { type Metadata } from "next";

import Home from "@/components/home/home";

export const metadata: Metadata = {
  title: "Home",
};

export default async function DashboardPage() {
  return <Home />;
}
