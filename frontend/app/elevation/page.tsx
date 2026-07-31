import { type Metadata } from "next";

import ElevationDemo from "@/components/elevation-demo";

export const metadata: Metadata = { title: "Elevation — Laminar" };

export default function ElevationPage() {
  return <ElevationDemo />;
}
