"use client";

import "@xyflow/react/dist/style.css";

import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  MiniMap,
  type Node,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { useCallback, useEffect } from "react";

import { LangGraphStructure } from "@/lib/langgraph/graph";
import { autoLayoutNodes, convertToReactFlow } from "@/lib/langgraph/utils";

import ConditionalEdge from "./conditional-edge";
import RunnableNode from "./runnable-node";
import SchemaNode from "./schema-node";

const nodeTypes = {
  schemaNode: SchemaNode,
  runnableNode: RunnableNode,
};

const edgeTypes = {
  conditional: ConditionalEdge,
};

interface LangGraphViewerProps {
  graphData: LangGraphStructure;
  className?: string;
}

export default function LangGraphViewer({ graphData, className }: LangGraphViewerProps) {
  const { nodes: initialNodes, edges: initialEdges } = convertToReactFlow(graphData);
  const layoutedNodes = autoLayoutNodes(initialNodes, initialEdges);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);

  // Re-layout when graph data changes
  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = convertToReactFlow(graphData);
    const layoutedNewNodes = autoLayoutNodes(newNodes, newEdges);
    setNodes(layoutedNewNodes);
    setEdges(newEdges);
  }, [graphData, setNodes, setEdges]);

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    console.log("Node clicked:", node);
  }, []);

  return (
    <div className={`w-full h-full ${className || ""}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        attributionPosition="top-right"
      >
        <Controls />
        <MiniMap />
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
      </ReactFlow>
    </div>
  );
}
