import { type Metadata } from "next";
import { redirect } from "next/navigation";

import NoSignals from "@/components/signals/no-signals";
import { getFirstSignalId } from "@/lib/actions/signals";

export const metadata: Metadata = {
  title: "Signals",
};

/** No list page: open the signal the sidenav shows first. */
export default async function SignalsPage(props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await props.params;
  const signalId = await getFirstSignalId(projectId);
  if (signalId) redirect(`/project/${projectId}/signals/${signalId}`);
  return <NoSignals />;
}
