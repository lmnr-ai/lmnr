import { type EventCluster } from "@/lib/actions/clusters";

export interface ClusterNode extends EventCluster {
  children: ClusterNode[];
}

export function buildTree(flatClusters: EventCluster[]): ClusterNode[] {
  const nodeMap = new Map<string, ClusterNode>();
  const roots: ClusterNode[] = [];

  flatClusters.forEach((cluster) => {
    nodeMap.set(cluster.id, { ...cluster, children: [] });
  });

  flatClusters.forEach((cluster) => {
    const node = nodeMap.get(cluster.id)!;
    if (cluster.parentId === null || !nodeMap.has(cluster.parentId)) {
      roots.push(node);
    } else {
      nodeMap.get(cluster.parentId)!.children.push(node);
    }
  });

  return roots;
}

export function findNodeById(nodes: ClusterNode[], id: string): ClusterNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNodeById(node.children, id);
    if (found) return found;
  }
  return null;
}

export function collectDescendantIds(node: ClusterNode): string[] {
  const ids = [node.id];
  for (const child of node.children) {
    ids.push(...collectDescendantIds(child));
  }
  return ids;
}

export function buildPath(allNodes: ClusterNode[], targetId: string): ClusterNode[] {
  const path: ClusterNode[] = [];

  function dfs(nodes: ClusterNode[], target: string): boolean {
    for (const node of nodes) {
      if (node.id === target) {
        path.push(node);
        return true;
      }
      if (dfs(node.children, target)) {
        path.unshift(node);
        return true;
      }
    }
    return false;
  }

  dfs(allNodes, targetId);
  return path;
}
