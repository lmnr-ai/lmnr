import { Metadata } from "next";

import Playgrounds from "@/components/playgrounds/playgrounds";

export const metadata: Metadata = {
  title: "Playgrounds",
};

export default async function PlaygroundsPage() {
  return <Playgrounds />;
}
