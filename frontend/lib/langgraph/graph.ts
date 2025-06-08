import type { Edge, Node } from "@xyflow/react";

// Types for LangGraph structure
export interface LangGraphNode {
  id: string;
  type: "schema" | "runnable";
  data:
    | string
    | {
        id: string[];
        name: string;
      };
  metadata?: {
    parents?: Record<string, any>;
    version?: number;
    variant?: string;
  };
}

export interface LangGraphEdge {
  source: string;
  target: string;
  data?: string;
  conditional?: boolean;
}

export interface LangGraphStructure {
  nodes: LangGraphNode[];
  edges: LangGraphEdge[];
}

// Use react-flow's built-in types with our custom data
export type GraphNode = Node<{
  label: string;
  nodeType: "schema" | "runnable";
  originalData: any;
  isStart?: boolean;
  isEnd?: boolean;
}>;

export type GraphEdge = Edge<{
  label?: string;
}>;
