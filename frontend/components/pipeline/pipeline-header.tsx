import React, { useEffect, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  SelectGroup
} from '@/components/ui/select';
import Link from 'next/link';
import { GitCommitVertical, PanelLeft, PanelRight } from 'lucide-react';
import { Pipeline, PipelineVersion, PipelineVersionInfo } from '@/lib/pipeline/types';
import { useProjectContext } from '@/contexts/project-context';
import { cn } from '@/lib/utils';
import CommitButton from './commit-button';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Skeleton } from '../ui/skeleton';
import { PresenceUser } from '@/lib/user/types';
import PresenceUserImage from '@/components/user/presence-user-image';
import PipelineEnv from './pipeline-env';
import OverwriteWorkshopButton from './overwrite-workshop-button';
import ForkButton from './fork-button';
import UseApi from './use-api';
import SetTargetVersionButton from './target-version';

const getWorkshopVersionId = (pipelineVersions: PipelineVersionInfo[]) => { return pipelineVersions.filter(pv => pv.pipelineType === "WORKSHOP")[0].id }

interface PipelineHeaderProps {
  pipeline: Pipeline;
  unsavedChanges: boolean;
  selectedPipelineVersion: PipelineVersion | null;
  onPipelineVersionSelect: (versionInfo: PipelineVersionInfo) => void;
  onPipelineVersionSave: () => void;
  onLeftPanelOpenChange: (open: boolean) => void;
  onRightPanelOpenChange: (open: boolean) => void;
  presenceUsers: PresenceUser[];
}

export default function PipelineHeader({
  pipeline,
  selectedPipelineVersion,
  unsavedChanges,
  onPipelineVersionSelect,
  onLeftPanelOpenChange,
  onRightPanelOpenChange,
  presenceUsers
}: PipelineHeaderProps) {
  const searchParams = useSearchParams()
  const router = useRouter();
  const pathName = usePathname();

  const [pipelineVersions, setPipelineVersions] = useState<PipelineVersionInfo[]>([])
  const [selectedPipelineVersionPreview, setSelectedPipelineVersionPreview] = useState<PipelineVersionInfo | null>();
  const [targetVersionId, setTargetVersionId] = useState<string | null>(pipeline.targetVersionId);
  const { projectId } = useProjectContext()
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);

  // TODO: Somehow override useSearchParams by router.push or other approaches instead of selectVersionId
  const getPipelineVersions = (selectVersionId: string | null = null) => {
    fetch(`/api/projects/${projectId}/pipelines/${pipeline.id}/versions-info`, {
      method: 'GET'
    }).then(res => res.json()).then(res => {
      let pipelineVersions = [...res.commitVersions, res.workshopVersion];
      setPipelineVersions(pipelineVersions)

      // first, try to see if any callback explicitly sets versionId using selectVersionId
      const versionId = selectVersionId || searchParams.get('versionId');

      let selectedPipelineVersion = null
      if (versionId) {
        selectedPipelineVersion = (pipelineVersions as PipelineVersionInfo[]).filter(pv => pv.id === versionId)[0]
      } else {
        selectedPipelineVersion = res.workshopVersion;
      }

      // TODO: Set focusedNodeId to null when switching versions, apply in Public Header too
      // simply setFocusedNodeId(null) doesn't work
      setSelectedPipelineVersionPreview(selectedPipelineVersion)

      // TODO: Figure out how not to call it twice here and in Select.onValueChange
      onPipelineVersionSelect(selectedPipelineVersion)
    })
  }

  useEffect(() => {
    onLeftPanelOpenChange(leftPanelOpen);
  }, [leftPanelOpen]);

  useEffect(() => {
    onRightPanelOpenChange(rightPanelOpen);
  }, [rightPanelOpen]);

  useEffect(() => {
    getPipelineVersions();
  }, []);

  return (
    <div className="flex items-center h-14 border-b pl-4 space-x-4 pr-4">
      {
        !selectedPipelineVersionPreview && (
          <Skeleton className='h-8 w-80' />
        )
      }
      {selectedPipelineVersionPreview && (
        <>
          <div className='max-w-48'>
            <Select
              defaultValue={selectedPipelineVersionPreview.id}
              value={selectedPipelineVersionPreview.id}
              onValueChange={(value) => {
                router.push(`${pathName}?versionId=${value}`);

                const selectedPipelineVersion = pipelineVersions.find((version) => version.id === value)
                setSelectedPipelineVersionPreview(selectedPipelineVersion!)
                onPipelineVersionSelect(selectedPipelineVersion!)
              }}
            >
              <SelectTrigger className="h-7 font-medium bg-secondary">
                <GitCommitVertical size={16} className='min-h-4 w-4' />
                <SelectValue placeholder="version" className='' />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Workshop</SelectLabel>
                  {
                    pipelineVersions.filter((version) => version.pipelineType == "WORKSHOP").map((version) => (
                      <SelectItem key={version.id} value={version.id!} className='flex'>
                        <div className='truncate mx-1'>
                          workshop
                        </div>
                      </SelectItem>
                    ))
                  }
                </SelectGroup>
                {pipelineVersions.filter((version) => version.pipelineType == "COMMIT").length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Commits</SelectLabel>
                    {
                      pipelineVersions.filter((version) => version.pipelineType == "COMMIT").map((version) => (
                        <SelectItem key={version.id} value={version.id!}>
                          <div className='flex items-center truncate'>
                            <div className='truncate mx-1'>
                              {version.name}
                            </div>
                            {
                              version.id === targetVersionId && (
                                <span className="text-xs text-gray-400"> (target)</span>
                              )
                            }
                          </div>
                        </SelectItem>
                      ))
                    }
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </div>
          {selectedPipelineVersionPreview.pipelineType === "COMMIT" && targetVersionId !== selectedPipelineVersionPreview.id &&
            <SetTargetVersionButton
              pipelineId={pipeline.id}
              pipelineVersionId={selectedPipelineVersion?.id ?? ""}
              onTargetVersionChanged={(targetVersionId) => {
                setTargetVersionId(targetVersionId);
              }}
            />
          }
          {
            (selectedPipelineVersionPreview.pipelineType === "WORKSHOP") && (
              <CommitButton
                selectedPipelineVersion={selectedPipelineVersionPreview!}
                onPipelineVersionsChange={getPipelineVersions}
              />
            )
          }
          {/* {
            (selectedPipelineVersion.pipelineType === "WORKSHOP") && (
              <div className="flex space-x-4">
                <Button
                  variant="outline"
                  className="flex h-7 text-green-400 px-2"
                  onClick={() => {
                    onPipelineVersionSave()
                  }}
                >
                  <Save className='h-4' />
                  Save
                </Button>
              </div>
            )
          } */}
          {
            (selectedPipelineVersionPreview.pipelineType === "COMMIT") && (
              <OverwriteWorkshopButton
                workshopVersionId={getWorkshopVersionId(pipelineVersions)}
                selectedPipelineVersion={selectedPipelineVersionPreview}
                onPipelineVersionsChange={() => {
                  let workshopVersionId = getWorkshopVersionId(pipelineVersions);
                  router.push(`${pathName}?versionId=${workshopVersionId}`);
                  getPipelineVersions(workshopVersionId)
                }}
              />
            )
          }
          <ForkButton
            defaultNewPipelineName={`${pipeline.name} copy`}
            selectedPipelineVersion={selectedPipelineVersionPreview}
          />
          <PipelineEnv projectId={projectId} />
          {selectedPipelineVersion && pipelineVersions.length > 1 &&
            <UseApi pipelineName={pipeline.name} targetRunnableGraph={selectedPipelineVersion.runnableGraph} />
          }

          {/*pipelineVersions.length > 1 && (
            <DeletePipelineVersionButton selectedPipelineVersion={selectedPipelineVersion!} />
          )*/}
          <div className="w-1.5 h-7 flex items-center">
            {unsavedChanges && <div className='w-1.5 h-1.5 rounded-full bg-yellow-500'></div>}
          </div>
          <div className='flex space-x-1'>
            <PanelLeft
              onClick={() => {
                setLeftPanelOpen((prev) => {
                  const newState = !prev
                  return newState
                })
              }}
              size={20}
              className={cn('cursor-pointer', leftPanelOpen ? '' : ' text-gray-300')}
            />
            <PanelRight
              onClick={() => {
                setRightPanelOpen((prev) => {
                  const newState = !prev
                  return newState
                })
              }}
              size={20}
              className={cn('cursor-pointer', rightPanelOpen ? '' : ' text-gray-300')}
            />
          </div>
          <div className="flex space-x-1">
            {presenceUsers.map((user) => (
              <PresenceUserImage key={user.id} presenceUser={user} />
            ))}
          </div>
        </>
      )}
    </div >
  );
}
