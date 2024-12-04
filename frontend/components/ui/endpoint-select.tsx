import { PlusCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useProjectContext } from '@/contexts/project-context';
import { Endpoint } from '@/lib/endpoint/types';
import { cn } from '@/lib/utils';

interface EndpointSelectProps {
  className?: string;
  onEndpointIdChange: (value: string) => void;
  createNewEndpointId?: string;
  disabled?: boolean;
}

export default function EndpointSelect({
  className,
  onEndpointIdChange,
  createNewEndpointId,
  disabled
}: EndpointSelectProps) {
  const { projectId } = useProjectContext();
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/endpoints`)
      .then((res) => res.json())
      .then((endpoints) => {
        setEndpoints(endpoints);
      });
  }, []);

  return (
    <div className={cn('flex align-middle space-x-2', className)}>
      <Select disabled={disabled} onValueChange={onEndpointIdChange}>
        <SelectTrigger className="font-medium">
          <SelectValue placeholder="Select endpoint" />
        </SelectTrigger>
        <SelectContent>
          {createNewEndpointId && (
            <SelectItem key={createNewEndpointId} value={createNewEndpointId}>
              <div className="flex items-center">
                <PlusCircle size={14} className="mr-2" />
                Create new
              </div>
            </SelectItem>
          )}
          {endpoints.map((endpoint) => (
            <SelectItem key={endpoint.id} value={endpoint.id}>
              {endpoint.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
