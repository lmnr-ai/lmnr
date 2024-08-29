import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useEffect, useState } from "react"
import { Pipeline, PipelineVersion } from "@/lib/pipeline/types"
import { useProjectContext } from "@/contexts/project-context"
import { GitBranch, GitCommitVertical, Loader, Radio } from "lucide-react"

interface PipelineSelectProps {
  onPipelineChange?: (pipeline: Pipeline) => void
  onPipelineVersionChange: (pipelineVersion: PipelineVersion | null) => void
  defaultPipelineName?: string,
  defaultPipelineId?: string,
  defaultPipelineVersionName?: string,
  defaultPipelineVersionId?: string,
  hideWorkshopVersions?: boolean
}

// TODO:
// Add lightweight alternative which only deals with PipelineVersionInfo
// or fetch runnableGraph manually in onPipelineVersionChange
export default function PipelineSelect({
  onPipelineChange,
  onPipelineVersionChange,
  defaultPipelineName,
  defaultPipelineId,
  defaultPipelineVersionName,
  defaultPipelineVersionId,
  hideWorkshopVersions
}: PipelineSelectProps) {
  const [pipelines, setPipelines] = useState<Pipeline[] | null>(null)
  const [pipelineVersions, _setPipelineVersions] = useState<PipelineVersion[] | null>(null)
  const { projectId } = useProjectContext()

  // TODO: Fix this hack
  const [defaultPipelineNameState, setDefaultPipelineName] = useState<string | undefined>(defaultPipelineName)
  const [defaultPipelineVersionNameState, setDefaultPipelineVersionName] = useState<string | undefined>(defaultPipelineVersionName)
  // and this one. For some reason, this component re-renders itself with defaultPipelineId = undefined even when it is passed correctly.
  // So infer the pipeline id from the version id. This is slow and not the best UX.
  const [defaultPipelineIdState, setDefaultPipelineId] = useState<string | undefined>(defaultPipelineId)

  const setPipelineVersions = (pipelineVersions: PipelineVersion[]) => {
    if (hideWorkshopVersions) {
      pipelineVersions = pipelineVersions.filter((version) => version.pipelineType !== "WORKSHOP")
    }
    _setPipelineVersions(pipelineVersions)
  }

  useEffect(() => {
    fetch(`/api/projects/${projectId}/pipelines`)
      .then(res => res.json())
      .then(pipelines => {
        setPipelines(pipelines)
      });
    if (!!defaultPipelineVersionId && (!defaultPipelineVersionName || !defaultPipelineIdState || !defaultPipelineName)) {
      // Note: This is a heavy request (returns graph too), but ok for now
      fetch(`/api/projects/${projectId}/pipeline-versions/${defaultPipelineVersionId}`)
        .then(res => res.json())
        .then(pipelineVersion => {
          setDefaultPipelineVersionName(pipelineVersion.name)
          if (!defaultPipelineIdState) {
            fetch(`/api/projects/${projectId}/pipelines/${pipelineVersion.pipelineId}`)
              .then(res => res.json())
              .then(pipeline => {
                setDefaultPipelineName(pipeline.name)
                setDefaultPipelineId(pipeline.id)

                fetch(`/api/projects/${projectId}/pipelines/${pipeline.id}/versions`)
                  .then(res => res.json())
                  .then(pipelineVersions => {
                    setPipelineVersions(pipelineVersions)
                  })
              })
          }
        })
    }

    // This is needed so that we can easily change pipeline version id after re-loading the page
    // Otherwise, if user wants to change pipeline version id after re-loading the page,
    // he'll need to select pipeline first and only then will be able to select pipeline version
    if (!!defaultPipelineIdState) {
      // Assume that defaultPipelineName is provided, otherwise add code here to fetch it
      fetch(`/api/projects/${projectId}/pipelines/${defaultPipelineIdState}/versions`)
        .then(res => res.json())
        .then(pipelineVersions => {
          setPipelineVersions(pipelineVersions)
        })
    }
  }, [])

  return (
    <div className="flex align-middle space-x-2">
      <Select
        onValueChange={async (pipelineId) => {
          const pipeline = pipelines!.find(pipeline => pipeline.id === pipelineId)!
          const res = await fetch(`/api/projects/${projectId}/pipelines/${pipelineId}/versions`)
          let pipelineVersions = await res.json() as PipelineVersion[]
          setPipelineVersions(pipelineVersions)
          onPipelineChange?.(pipeline)
          onPipelineVersionChange(null)
          setDefaultPipelineVersionName(undefined)
        }}
        defaultValue={defaultPipelineIdState}
      >
        <SelectTrigger className="font-medium h-7">
          <SelectValue placeholder={defaultPipelineNameState ?? "Select pipeline"} className='text-ellipsis' />
        </SelectTrigger>
        <SelectContent>
          {(pipelines === null) ? (
            <SelectItem key={-1} value={"-1"} className="flex justify-center" disabled={true}>
              <Loader className="animate-spin block" size={16} />
            </SelectItem>
          ) : (pipelines!.map((pipeline) => (
            <SelectItem key={pipeline.id} value={pipeline.id!}>
              {pipeline.name}
            </SelectItem>
          )))
          }
        </SelectContent>
      </Select>

      <div className="flex items-center align-middle">
        <GitCommitVertical size={16} />
      </div>

      <Select
        onValueChange={(value) => {
          const selectedPipelineVersion = pipelineVersions!.find((version) => version.id === value)!
          onPipelineVersionChange(selectedPipelineVersion)
        }}
      >
        <SelectTrigger disabled={pipelineVersions === null || pipelineVersions.length === 0} className="w-32 h-7 font-medium">
          <SelectValue placeholder={defaultPipelineVersionNameState ?? "Select version"} className='overflow-hidden text-ellipsis' />
        </SelectTrigger>
        {pipelineVersions === null ? (
          <SelectContent>
            <SelectItem key={-1} value={"-1"} className="flex justify-center" disabled={true}>
              <Loader className="animate-spin block" size={16} />
            </SelectItem>
          </SelectContent>
        ) :
          (<SelectContent>
            {pipelineVersions && pipelineVersions.filter((version) => version.pipelineType === "COMMIT").length > 0 && (
              <SelectGroup>
                <SelectLabel>Commits</SelectLabel>
                {
                  pipelineVersions.filter((version) => version.pipelineType === "COMMIT").map((version) => (
                    <SelectItem key={version.id} value={version.id!}>
                      {version.name}
                    </SelectItem>
                  ))
                }
              </SelectGroup>
            )}
            {(!hideWorkshopVersions) && (<SelectGroup>
              <SelectLabel>Workshop</SelectLabel>
              {
                pipelineVersions && pipelineVersions!.filter((version) => version.pipelineType === "WORKSHOP").map((version) => (
                  <SelectItem key={version.id} value={version.id!} className='flex'>
                    {version.name}
                  </SelectItem>
                ))
              }
            </SelectGroup>)}
          </SelectContent>)}
      </Select>
    </div>
  );
}