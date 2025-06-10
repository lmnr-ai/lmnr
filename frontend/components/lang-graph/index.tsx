"use client";

import "@xyflow/react/dist/style.css";

import { ConnectionLineType, ReactFlow, useEdgesState, useNodesState } from "@xyflow/react";

import { LangGraphStructure } from "@/lib/lang-graph/types";
import { convertToReactFlow, getLayoutedElements } from "@/lib/lang-graph/utils";
import { cn } from "@/lib/utils";

import Edge from "./edge";
import RunnableNode from "./runnable-node";
import SchemaNode from "./schema-node";

const nodeTypes = {
  schemaNode: SchemaNode,
  runnableNode: RunnableNode,
};

const edgeTypes = {
  default: Edge,
};

interface LangGraphViewerProps {
  graphData: LangGraphStructure;
  className?: string;
}

export default function LangGraphViewer({ graphData, className }: LangGraphViewerProps) {
  const { nodes: convertedNodes, edges: convertedEdges } = convertToReactFlow(graphData);
  const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(convertedNodes, convertedEdges);

  const [nodes, , onNodesChange] = useNodesState(layoutedNodes);
  const [edges, , onEdgesChange] = useEdgesState(layoutedEdges);

  return (
    <div className={cn(`w-full h-full`, className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        connectionLineType={ConnectionLineType.SmoothStep}
      />
    </div>
  );
}
