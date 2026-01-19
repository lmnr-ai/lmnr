import { getServerSession } from "next-auth";

import Landing from "@/components/landing";
import { authOptions } from "@/lib/auth";

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

  return <Landing hasSession={session !== null && session !== undefined} />;
}
