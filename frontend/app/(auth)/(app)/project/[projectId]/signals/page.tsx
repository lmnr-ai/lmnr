import { type Metadata } from "next";

import Signals from "@/components/signals";

export const metadata: Metadata = {
  title: "Signals",
};

export default async function SignalsPage() {
  return <Signals />;
}
