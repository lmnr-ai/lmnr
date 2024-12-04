import { CheckJob } from '@/lib/check/types';
import { EndpointPipelineVersion, PipelineVersion } from '@/lib/pipeline/types';

import { Dataset } from '../dataset/types';
import { RunnableGraph } from '../flow/types';

export type Endpoint = {
  id: string;
  name: string;
  targetPipelineVersionId: string | null;
  candidatePipelineVersionId: string | null;
  checks?: string; // Json array of Check[]
  createdAt?: string;
  projectId: string;
  pipelineVersions: (PipelineVersion & EndpointPipelineVersion)[];
  currentCheckJobs?: CheckJob[];
  logDatasets: Dataset[];

  codeDeploymentStatus?: string;
  codeLastDeployedAt?: string;
};

export type EndpointInfoResponse = {
  id: string;
  createdAt: string;
  name: string;
  projectId: string;
  codeDeploymentStatus?: string;
  codeLastDeployedAt?: string;

  targetPipelineVersionId?: string;
  targetPipelineVersionName?: string;
  targetPipelineId?: string;
  targetPipelineName?: string;
  targetPipelineVersionDeployedAt?: string;
  targetPipelineVersionRunnableGraph?: RunnableGraph;
  candidatePipelineVersionId?: string;
  candidatePipelineVersionName?: string;
  candidatePipelineId?: string;
  candidatePipelineName?: string;
  candidatePipelineVersionDeployedAt?: string;
};

export type EndpointInfoPipelineVersion = {
  id: string;
  name: string;
  pipelineId: string;
  pipelineName: string;
  deployedAt: string;
};

export type EndpointPipelineVersionGraph = {
  id: string;
  name: string;
  runnableGraph: RunnableGraph;
};
