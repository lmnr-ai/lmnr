import type { Edge, Node } from "@xyflow/react";

import { LangGraphStructure } from "@/lib/langgraph/graph";

// Convert LangGraph structure to React Flow format
export function convertToReactFlow(langGraph: LangGraphStructure): {
  nodes: Node[];
  edges: Edge[];
} {
  const nodes: Node[] = langGraph.nodes.map((node, index) => {
    let label = "";
    let isStart = false;
    let isEnd = false;

    if (node.id === "__start__") {
      label = "Start";
      isStart = true;
    } else if (node.id === "__end__") {
      label = "End";
      isEnd = true;
    } else if (typeof node.data === "string") {
      label = node.data;
    } else if (node.data && typeof node.data === "object") {
      label = node.data.name || node.id;
    } else {
      label = node.id;
    }

    return {
      id: node.id,
      type: getNodeType(node),
      position: calculateNodePosition(index, langGraph.nodes.length),
      data: {
        label,
        nodeType: node.type,
        originalData: node.data,
        isStart,
        isEnd,
      },
    };
  });

  const edges: Edge[] = langGraph.edges.map((edge, index) => ({
    id: `${edge.source}-${edge.target}-${index}`,
    source: edge.source,
    target: edge.target,
    type: edge.conditional ? "conditional" : "default",
    label: edge.data || "",
    style: edge.conditional ? { stroke: "#ff6b6b", strokeWidth: 2 } : { stroke: "#888", strokeWidth: 2 },
    markerEnd: {
      type: "arrowclosed",
      color: edge.conditional ? "#ff6b6b" : "#888",
    },
  }));

  return { nodes, edges };
}

// Determine node type for styling
function getNodeType(node: any): string {
  if (node.id === "__start__" || node.id === "__end__") {
    return "schemaNode";
  }
  return node.type === "runnable" ? "runnableNode" : "schemaNode";
}

// Simple layout algorithm - can be enhanced with more sophisticated layouts
function calculateNodePosition(index: number, totalNodes: number): { x: number; y: number } {
  const radius = Math.max(200, totalNodes * 40);
  const angle = (index / totalNodes) * 2 * Math.PI;

  return {
    x: Math.cos(angle) * radius + 400,
    y: Math.sin(angle) * radius + 300,
  };
}

// Auto-layout using a simple hierarchical approach
export function autoLayoutNodes(nodes: Node[], edges: Edge[]): Node[] {
  const levels: { [key: number]: string[] } = {};
  const nodeToLevel: { [key: string]: number } = {};

  // Find start node
  const startNode = nodes.find((n) => n.data.isStart);
  if (startNode) {
    nodeToLevel[startNode.id] = 0;
    levels[0] = [startNode.id];
  }

  // Build levels using BFS
  const visited = new Set<string>();
  const queue = startNode ? [startNode.id] : [];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const currentLevel = nodeToLevel[currentId] || 0;
    const nextLevel = currentLevel + 1;

    edges
      .filter((e) => e.source === currentId)
      .forEach((edge) => {
        if (!nodeToLevel.hasOwnProperty(edge.target)) {
          nodeToLevel[edge.target] = nextLevel;
          if (!levels[nextLevel]) levels[nextLevel] = [];
          levels[nextLevel].push(edge.target);
          queue.push(edge.target);
        }
      });
  }

  // Position nodes based on levels
  return nodes.map((node) => {
    const level = nodeToLevel[node.id] || 0;
    const levelNodes = levels[level] || [];
    const indexInLevel = levelNodes.indexOf(node.id);
    const totalInLevel = levelNodes.length;

    return {
      ...node,
      position: {
        x: level * 250,
        y: (indexInLevel - totalInLevel / 2) * 100 + 300,
      },
    };
  });
}
