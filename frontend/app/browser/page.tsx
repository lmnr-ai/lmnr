import BrowserSession from "@/components/browser-session/browser-session";
import { clickhouseClient } from "@/lib/clickhouse/client";

export default async function BrowserPage() {

    const traceId = '66c6e431-6c1d-99ad-ae3c-c0198b812ad1';

    // query clickhouse to get session events for id
    const res = await clickhouseClient.query({
        query: 'SELECT * FROM browser_session_events WHERE trace_id = {id: UUID} ORDER BY timestamp ASC',
        format: 'JSONEachRow',
        query_params: {
            id: traceId
        }
    });

    const events = await res.json();

    return <BrowserSession events={events} />;
}
