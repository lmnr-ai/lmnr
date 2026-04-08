import { type Metadata } from "next";

import Home from "@/components/home";

export const metadata: Metadata = {
  title: "Home",
};

export default async function HomePage() {
  return <Home />;
}
