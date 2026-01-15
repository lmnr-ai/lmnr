import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import Landing from "@/components/landing";

export default async function LandingPage() {
  const session = await getServerSession(authOptions);

  // TODO: reenable
  //if (!isFeatureEnabled(Feature.LANDING)) {
  //  if (!session) {
  //    redirect("/sign-in");
  //  } else {
  //    redirect("/projects");
  //  }
  //}
  //
  //if (session) {
  //  redirect("/projects");
  //}

  return <Landing />;
}
