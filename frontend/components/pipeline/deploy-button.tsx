import React, { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useToast } from '../../lib/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Loader2, Rocket } from 'lucide-react';
import { PipelineVersionInfo } from '@/lib/pipeline/types';
import { useProjectContext } from '@/contexts/project-context';
import EndpointSelect from '../ui/endpoint-select';
import { getLocalDevSessions, getLocalEnvVars } from '@/lib/utils';
import { GRAPH_VALID, validateGraph } from '@/lib/pipeline/utils';
import useStore from '@/lib/flow/store';

const CREATE_NEW_ENDPOINT_ID = 'create-new-endpoint';

interface DeployButtonProps {
  selectedPipelineVersion: PipelineVersionInfo;
  onPipelineVersionsChange: () => void;
}

export default function DeployButton({
  selectedPipelineVersion,
  onPipelineVersionsChange
}: DeployButtonProps) {
  const { projectId } = useProjectContext();
  const { toast } = useToast();

  // Used if workshop version is being deployed
  const [commitPipelineVersionName, setCommitPipelineVersionName] =
    useState<string>('');

  // Either select an endpoint id or provide name to create a new one
  const [selectedEndpointId, setSelectedEndpointId] = useState<string | null>(
    null
  );
  const [newEndpointName, setNewEndpointName] = useState('');

  const [isDeploying, setIsDeploying] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { getGraph, getEdges } = useStore();

  const deployPipelineVersion = async () => {
    setIsDeploying(true);

    const env = getLocalEnvVars(projectId);
    const devSessionIds = getLocalDevSessions(projectId);

    if (selectedPipelineVersion.pipelineType === 'WORKSHOP') {
      const validationRes = validateGraph(getGraph(), getEdges());
      if (validationRes !== GRAPH_VALID) {
        toast({
          title: 'Only valid graphs can be committed',
          variant: 'destructive',
          description: validationRes,
          duration: 10000
        });

        setIsDeploying(false);
        return;
      }
    }

    let res = await fetch(
      `/api/projects/${projectId}/pipelines/${selectedPipelineVersion.pipelineId}/versions/deploy`,
      {
        method: 'POST',
        body: JSON.stringify({
          pipelineVersionId: selectedPipelineVersion.id,
          pipelineVersionName: commitPipelineVersionName,
          endpointId:
            selectedEndpointId === CREATE_NEW_ENDPOINT_ID
              ? null
              : selectedEndpointId,
          endpointName:
            selectedEndpointId === CREATE_NEW_ENDPOINT_ID
              ? newEndpointName
              : null,
          env,
          devSessionIds
        }),
        cache: 'no-cache'
      }
    );

    if (res.status != 200) {
      toast({
        title: 'Error deploying version',
        variant: 'destructive'
      });

      setIsDeploying(false);
      return;
    }

    toast({
      title: 'Successfully deployed version'
    });

    setIsDeploying(false);
    setIsDialogOpen(false);
    onPipelineVersionsChange();
  };

  return (
    <Dialog
      open={isDialogOpen}
      onOpenChange={(open) => {
        setIsDialogOpen(open);
        setCommitPipelineVersionName('');
        setSelectedEndpointId(null);
        setNewEndpointName('');
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="h-7 text-purple-400">
          <Rocket className="h-4" />
          Deploy
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Deploy to endpoint</DialogTitle>
        </DialogHeader>
        {selectedPipelineVersion.pipelineType === 'WORKSHOP' && (
          <Label className="mb-8 text-orange-300">
            This will create new commit version and deploy it to endpoint
          </Label>
        )}
        {selectedPipelineVersion.pipelineType === 'COMMIT' && (
          <Label className="mb-8">
            Deploy current commit version to endpoint
          </Label>
        )}
        {selectedPipelineVersion.pipelineType === 'WORKSHOP' && (
          <div>
            <Label>Commit version name</Label>
            <Input
              className="mb-4"
              autoFocus
              placeholder="Version name"
              value={commitPipelineVersionName}
              onChange={(e) => setCommitPipelineVersionName(e.target.value)}
            />
          </div>
        )}
        <Label>Endpoint</Label>
        <EndpointSelect
          onEndpointIdChange={setSelectedEndpointId}
          createNewEndpointId={CREATE_NEW_ENDPOINT_ID}
        />
        {selectedEndpointId === CREATE_NEW_ENDPOINT_ID && (
          <Input
            className="mb-4"
            placeholder="Enter new endpoint name"
            value={newEndpointName}
            onChange={(e) => setNewEndpointName(e.target.value)}
          />
        )}
        <DialogFooter>
          <Button
            handleEnter={true}
            disabled={
              (selectedPipelineVersion.pipelineType === 'WORKSHOP' &&
                !commitPipelineVersionName) ||
              !selectedEndpointId ||
              (selectedEndpointId === CREATE_NEW_ENDPOINT_ID &&
                !newEndpointName) ||
              isDeploying
            }
            onClick={deployPipelineVersion}
          >
            {isDeploying && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
            Deploy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
