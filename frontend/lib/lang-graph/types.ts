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

export const NODE_DIMENSIONS = {
  width: 180,
  maxHeight: 80,
  minHeight: 50,
  rankSep: 80,
  nodeSep: 60,
} as const;

export const SPAN_KEYS = {
  NODES: "lmnr.association.properties.langgraph.nodes",
  EDGES: "lmnr.association.properties.langgraph.edges",
} as const;
