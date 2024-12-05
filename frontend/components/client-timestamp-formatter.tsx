import { useEffect, useState } from 'react';

import {
  convertToLocalTimeWithMillis,
  formatTimestamp,
  TIME_MILLISECONDS_FORMAT
} from '@/lib/utils';

// This component is a client-side only component that will format a timestamp
// If it's not used, then there will be error because SSR will try to render
// this component with server's rather than user's timezone.
export default function ClientTimestampFormatter({
  timestamp,
  format = null
}: {
  timestamp: string;
  format?: string | null;
}) {
  const [formattedTimestamp, setFormattedTimestamp] = useState('');

  // This function will now run on the client side after mounting
  useEffect(() => {
    if (format === TIME_MILLISECONDS_FORMAT) {
      setFormattedTimestamp(convertToLocalTimeWithMillis(timestamp));
    } else {
      setFormattedTimestamp(formatTimestamp(timestamp));
    }
  }, []);

  return <span>{formattedTimestamp}</span>;
}
