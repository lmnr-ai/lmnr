// Client-safe leaf: `index.ts` pulls in `executeQuery` (server-only session
// lookup), so components import shared cluster types/constants from here.
export type EventCluster = {
  id: string;
  name: string;
  parentId: string | null;
  level: number;
  numChildrenClusters: number;
  numEvents: number;
  createdAt: string;
  updatedAt: string;
};

export const UNCLUSTERED_ID = "__unclustered__";
