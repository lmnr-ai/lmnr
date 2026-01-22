import { type Metadata } from "next";

import Signals from "@/components/signals";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

export const metadata: Metadata = {
  title: "Signals",
};

export default async function SignalsPage() {
  const isSignalsEnabled = isFeatureEnabled(Feature.SIGNALS);
  return <Signals isSignalsEnabled={isSignalsEnabled} />;
}
