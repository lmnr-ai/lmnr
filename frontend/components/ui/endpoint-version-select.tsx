import { Label } from '@radix-ui/react-label';
import { GitBranch, Radio } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useProjectContext } from '@/contexts/project-context';
import { Endpoint, EndpointPipelineVersionGraph } from '@/lib/endpoint/types';
import { GenericNode } from '@/lib/flow/types';

import { Button } from './button';

interface EndpointVersionSelectProps {
  onPipelineVersionChange?: (
    pipelineVersion: EndpointPipelineVersionGraph
  ) => void;
  onNodesChange?: (nodes: GenericNode[]) => void;
}

export default function EndpointVersionSelect({
  onPipelineVersionChange,
  onNodesChange
}: EndpointVersionSelectProps) {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [selectedEndpoint, setSelectedEndpoint] = useState<Endpoint | null>(
    null
  );
  const [pipelineVersions, setPipelineVersions] = useState<
    EndpointPipelineVersionGraph[] | null
  >(null);
  const [selectedPipelineVersion, setSelectedPipelineVersion] =
    useState<EndpointPipelineVersionGraph | null>(null);
  const [selectedNodes, setSelectedNodes] = useState<Set<GenericNode>>(
    new Set()
  );
  const { projectId } = useProjectContext();

  useEffect(() => {
    fetch(`/api/projects/${projectId}/endpoints`)
      .then((res) => res.json())
      .then((endpoints) => {
        setEndpoints(endpoints);
      });
  }, []);

  return (
    <div className="flex align-middle space-x-2">
      <Select
        value={selectedEndpoint?.id}
        onValueChange={async (endpointId) => {
          setSelectedEndpoint(
            endpoints.find((endpoint) => endpoint.id === endpointId)!
          );
          const res = await fetch(
            `/api/projects/${projectId}/endpoints/${endpointId}/pipeline-version-graphs`
          );
          const pipelineVersions =
            (await res.json()) as EndpointPipelineVersionGraph[];
          setPipelineVersions(pipelineVersions);
        }}
      >
        <SelectTrigger className="font-medium h-7">
          <SelectValue placeholder="Select endpoint" />
        </SelectTrigger>
        <SelectContent>
          {(endpoints ?? []).map((endpoint) => (
            <SelectItem key={endpoint.id} value={endpoint.id!}>
              {endpoint.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center align-middle">
        <GitBranch size={16} />
      </div>
      <Select
        value={selectedPipelineVersion?.id}
        onValueChange={(value) => {
          const selectedPipelineVersion = pipelineVersions!.find(
            (version) => version.id === value
          )!;
          setSelectedPipelineVersion(selectedPipelineVersion);
          setSelectedNodes(
            new Set(Object.values(selectedPipelineVersion.runnableGraph.nodes))
          );
          onNodesChange?.(
            Array.from(
              Object.values(selectedPipelineVersion.runnableGraph.nodes)
            )
          );
          onPipelineVersionChange?.(selectedPipelineVersion);
        }}
      >
        <SelectTrigger className="min-w-32 h-7 font-medium">
          <SelectValue
            placeholder="pipeline version"
            className="truncate bg-red-100"
          />
        </SelectTrigger>
        <SelectContent>
          {pipelineVersions &&
            pipelineVersions.length > 0 &&
            pipelineVersions.map((version, i) => (
              <SelectItem key={version.id} value={version.id}>
                <div className="flex items-center">
                  <Radio size={16} className="text-purple-400" />
                  <div className="ml-2">{version.name}</div>
                </div>
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      {selectedPipelineVersion && (
        <Popover>
          <PopoverTrigger asChild>
            <Button>Select nodes</Button>
          </PopoverTrigger>
          <PopoverContent>
            <div className="flex-col">
              {selectedPipelineVersion &&
                Object.values(selectedPipelineVersion.runnableGraph.nodes).map(
                  (node) => (
                    <div key={node.id} className="flex items-center p-1">
                      <Checkbox
                        id={node.id}
                        className="cursor-pointer"
                        checked={selectedNodes.has(node)}
                        onClick={() => {
                          if (selectedNodes.has(node)) {
                            selectedNodes.delete(node);
                          } else {
                            selectedNodes.add(node);
                          }
                          setSelectedNodes(new Set(selectedNodes));
                          onNodesChange?.(Array.from(selectedNodes));
                        }}
                      />
                      <Label htmlFor={node.id} className="cursor-pointer pl-2">
                        {node.name}
                      </Label>
                    </div>
                  )
                )}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
