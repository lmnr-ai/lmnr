import { type Metadata } from "next";
import { redirect } from "next/navigation";

import DeviceApproval from "@/components/device";
import {
  claimUserCodeForCurrentSession,
  type DeviceApprovalContext,
  listProjectsForCurrentSession,
  loadDeviceContext,
} from "@/lib/actions/device";
import { getServerSession } from "@/lib/auth-session";

export const metadata: Metadata = {
  title: "Authorize CLI - Laminar",
  description: "Authorize the Laminar CLI to access your account.",
};

interface DevicePageProps {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function DevicePage(props: DevicePageProps) {
  const session = await getServerSession();
  // proxy.ts gates this route, but guard explicitly so a middleware lapse
  // redirects cleanly instead of throwing a TypeError.
  if (!session?.user) {
    redirect("/sign-in?callbackUrl=/device");
  }
  const user = session.user;

  const searchParams = await props.searchParams;
  const rawUserCode = typeof searchParams?.user_code === "string" ? searchParams.user_code : null;

  if (!rawUserCode) {
    return <DeviceApproval userEmail={user.email} mode="enter-code" />;
  }

  // Bind the code to the current session before reading status so the form's
  // state reflects the just-completed claim.
  await claimUserCodeForCurrentSession(rawUserCode);

  // Fetch the picker data server-side so Step 2 has it without a client round-trip.
  const [context, sessionProjects] = await Promise.all([
    loadDeviceContext(rawUserCode) as Promise<DeviceApprovalContext | null>,
    listProjectsForCurrentSession(),
  ]);

  return (
    <DeviceApproval
      userEmail={user.email}
      mode="approve"
      rawUserCode={rawUserCode}
      context={context}
      projects={sessionProjects}
    />
  );
}
