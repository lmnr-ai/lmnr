import { Metadata } from "next";

import Events from "@/components/events/events";

export const metadata: Metadata = {
    title: "Events",
};

export default async function EventsPage(props: { params: Promise<{ projectId: string }> }) {
    return <Events />;
}

