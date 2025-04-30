import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import Landing from "@/components/landing/landing";
import LandingHeader from "@/components/landing/landing-header";
import { authOptions } from "@/lib/auth";

export default async function LandingPage() {
  const session = await getServerSession(authOptions);

  //TODO: revert back after dev.
  if (false) {
    if (!session) {
      redirect("/sign-in");
    } else {
      redirect("/projects");
    }
  }

  return (
    <>
      <LandingHeader hasSession={session !== null && session !== undefined} />
      <Landing />
    </>
  );
}
