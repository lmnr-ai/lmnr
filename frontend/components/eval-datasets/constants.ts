export const FETCH_SIZE = 50;

export const evalDatasetsHref = (projectId: string) => `/project/${projectId}/eval-datasets`;

export const evalDatasetHref = (projectId: string, dataset: string) =>
  `${evalDatasetsHref(projectId)}/${encodeURIComponent(dataset)}`;

export const evalDatasetVersionHref = (projectId: string, dataset: string, version: number) =>
  `${evalDatasetHref(projectId, dataset)}/${version}`;

/** The evaluations page with the version's group selected. */
export const versionEvaluationsHref = (projectId: string, group: string) =>
  `/project/${projectId}/evaluations?groupId=${encodeURIComponent(group)}`;
