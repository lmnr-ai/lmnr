import { type Metadata } from "next";

import RolloutSessions from "@/components/rollout-sessions/rollout-sessions";

export const metadata: Metadata = {
  title: "Rollout Sessions",
};

export default async function RolloutSessionsPage() {
  return <RolloutSessions />;
}
