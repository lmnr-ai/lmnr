'use client';

import { useProjectContext } from '@/contexts/project-context';
import { useEffect } from 'react';

interface QueueProps {
  queueId: string;
}

export default function Queue({ queueId }: QueueProps) {

  const { projectId } = useProjectContext();

  useEffect(() => {
    fetch(`/api/projects/${projectId}/queues/${queueId}/first`, {
      method: 'GET'
    }).then(async (data) => {
      if (data.ok) {
        const json = await data.json();
        console.log(json);
      } else {
        console.error('Error fetching first item', data);
      }
    });
  }, []);

  return <div>Queue</div>;
}
