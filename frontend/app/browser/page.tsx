import BrowserSession from "@/components/browser-session/browser-session";
import { clickhouseClient } from "@/lib/clickhouse/client";

export default async function BrowserPage() {

    const sessionId = '';

    // query clickhouse to get session events for id
    const res = await clickhouseClient.query({
        query: `SELECT * FROM browser_session_events WHERE session_id = '${sessionId}' ORDER BY timestamp ASC`,
        format: 'JSONEachRow',
    });

    const events = await res.json();

    return <BrowserSession events={events} />;
}
