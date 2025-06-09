import { Edge, MarkerType, Node } from "@xyflow/react";
import dagre from "dagre";
import { attempt, flow, get, has, isEmpty, isError, isObject, isString, map, reduce } from "lodash";

import { LangGraphEdge, LangGraphNode, LangGraphStructure, NODE_DIMENSIONS, SPAN_KEYS } from "@/lib/lang-graph/types";

const START_ID = "__start__";
const END_ID = "__end__";

export interface NodeTypeInfo {
  readonly isStart: boolean;
  readonly isEnd: boolean;
  readonly nodeType: "schema" | "runnable";
  readonly reactFlowType: string;
}

export interface ConvertedGraph {
  nodes: Node[];
  edges: Edge[];
}

const getNodeTypeInfo = (node: LangGraphNode): NodeTypeInfo => {
  const isStart = node.id === START_ID;
  const isEnd = node.id === END_ID;
  const isSchemaNode = isStart || isEnd || node.type === "schema";

  return {
    isStart,
    isEnd,
    nodeType: node.type,
    reactFlowType: isSchemaNode ? "schemaNode" : "runnableNode",
  };
};

const extractNodeLabel = (node: LangGraphNode): string => {
  if (node.id === START_ID) return "Start";
  if (node.id === END_ID) return "End";
  if (isString(node.data)) return node.data;
  if (isObject(node.data) && has(node.data, "name")) {
    return get(node.data, "name", node.id);
  }
  return node.id;
};

const convertNode = (node: LangGraphNode): Node => {
  const typeInfo = getNodeTypeInfo(node);
  const label = extractNodeLabel(node);

  return {
    id: node.id,
    type: typeInfo.reactFlowType,
    position: { x: 0, y: 0 },
    data: {
      label,
      nodeType: typeInfo.nodeType,
      originalData: node.data,
      isStart: typeInfo.isStart,
      isEnd: typeInfo.isEnd,
    },
  };
};

const convertEdge = (edge: LangGraphEdge, index: number): Edge => ({
  id: `${edge.source}-${edge.target}-${index}`,
  source: edge.source,
  target: edge.target,
  type: edge.conditional ? "conditional" : "default",
  label: edge.data || "",
  style: {
    stroke: edge.conditional ? "#ff6b6b" : "#888",
    strokeWidth: 2,
  },
  markerEnd: {
    type: MarkerType.Arrow,
  },
});

export const convertToReactFlow = flow([
  (langGraph: LangGraphStructure) => ({
    nodes: map(langGraph.nodes, convertNode),
    edges: map(langGraph.edges, convertEdge),
  }),
]);

const createDagreGraph = (nodes: Node[], edges: Edge[]) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: "TB",
    ranksep: NODE_DIMENSIONS.rankSep,
    nodesep: NODE_DIMENSIONS.nodeSep,
  });

  reduce(
    nodes,
    (graph, node) => {
      graph.setNode(node.id, {
        width: NODE_DIMENSIONS.width,
        height: NODE_DIMENSIONS.maxHeight,
      });
      return graph;
    },
    dagreGraph
  );

  reduce(
    edges,
    (graph, edge) => {
      graph.setEdge(edge.source, edge.target);
      return graph;
    },
    dagreGraph
  );

  return dagreGraph;
};

const calculateNodePosition = (node: Node, dagreGraph: dagre.graphlib.Graph): Node => {
  const nodeWithPosition = dagreGraph.node(node.id);
  return {
    ...node,
    position: {
      x: nodeWithPosition.x - NODE_DIMENSIONS.width / 2,
      y: nodeWithPosition.y - NODE_DIMENSIONS.maxHeight / 2,
    },
  };
};

export const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
  const dagreGraph = createDagreGraph(nodes, edges);
  dagre.layout(dagreGraph);

  const layoutedNodes = map(nodes, (node) => calculateNodePosition(node, dagreGraph));

  return { nodes: layoutedNodes, edges };
};

const safeParseJson = <T>(value: string, defaultValue: T) => {
  const result = attempt(() => JSON.parse(value));
  return isError(result) ? defaultValue : result;
};

const extractGraphData = (attributes: Record<string, any>) => ({
  nodes: safeParseJson<Node[]>(get(attributes, SPAN_KEYS.NODES, ""), []),
  edges: safeParseJson<Edge[]>(get(attributes, SPAN_KEYS.EDGES, ""), []),
});

export const getLangGraphFromSpan = <T = any>(spanAttributes?: Record<string, T>): LangGraphStructure => {
  if (isEmpty(spanAttributes) || !spanAttributes) {
    return {
      nodes: [],
      edges: [],
    };
  }

  return extractGraphData(spanAttributes);
};
