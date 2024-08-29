import { useEffect, useState } from 'react';
import { formatTimestamp } from "@/lib/utils";

// This component is a client-side only component that will format a timestamp
// If it's not used, then there will be error because SSR will try to render
// this component with server's rather than user's timezone.
export default function ClientTimestampFormatter({ timestamp }: { timestamp: string }) {
    const [formattedTimestamp, setFormattedTimestamp] = useState('');

    useEffect(() => {
        // This function will now run on the client side after mounting
        setFormattedTimestamp(formatTimestamp(timestamp));
    }, []);

    return (<span>{formattedTimestamp}</span>);
};
