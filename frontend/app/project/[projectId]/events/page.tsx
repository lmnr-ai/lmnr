import { redirect } from "next/navigation";

export default async function EventsPage(props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await props.params;
  redirect(`/project/${projectId}/events/semantic`);
}
