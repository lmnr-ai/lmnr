import { Edge } from "reactflow";
import { Graph } from "../flow/graph";
import { GenericNode, GenericNodeHandle, MapNode, NodeHandleType, NodeType, SubpipelineNode } from "../flow/types";
import { ChatMessage } from "../types";
import { InputVariable, PipelineVersion } from "./types";
import { isStringType } from "../utils";

export const PUBLIC_PIPELINE_PROJECT_ID = "PUBLIC-PIPELINE"
export const PUBLIC_PIPELINE_PROJECT_NAME = "Public pipeline"
export const GRAPH_VALID = "VALID";

const formatNodeById = (graph: Graph, id: string): string => {
  const node = graph.nodes.get(id);
  if (node === undefined) {
    return `Unknown node (id: ${id})`;
  }
  return formatNode(node);
}

const formatNode = (node: GenericNode): string => {
  if (node.type === NodeType.CONDITION) {
    return `Condition handle: ${node.name}`
  }
  return `${node.name} (type: ${node.type})`;
}

const getDisconnectedNodes = (graph: Graph, edges: Edge[]): GenericNode[] => {
  let connectedNodes = new Set<string>();
  for (const edge of edges) {
    connectedNodes.add(edge.source.split('_')[0]);
    connectedNodes.add(edge.target.split('_')[0]);
  }
  return Array.from(graph.nodes.values())
    .filter(node => !connectedNodes.has(node.id) && node.type != NodeType.CONDITION)
}

const getDisconnectedInputHandles = (node: GenericNode): GenericNodeHandle[] => {
  const allNodeInputs = node.inputs.concat(node.dynamicInputs || []);
  const disconnectInputHandles = allNodeInputs.filter(input => !Object.keys(node.inputsMappings ?? {}).includes(input.id));
  return disconnectInputHandles;
}

const getNodesWithDisconnectedOutputHandles = (graph: Graph, edges: Edge[]): GenericNode[] => {

  const connectedOutputHandles = new Set<string>(
    edges
      .filter(edge => edge.sourceHandle != undefined)
      .map(edge => edge.sourceHandle!)
  );
  return Array.from(graph.nodes.values())
    .filter(node => node.isCondtional !== true) // conditional nodes have virtual output handles that are disconnected
    .filter(node => !node.outputs.every(output => connectedOutputHandles.has(output.id)));
}

// traverses the graph by checking every input handle of every node and checks which handles 
// are visited more than once. If a handle is visited more than once, it is marked as cyclic.
// See docs on GenericNodeHandle.isCyclic.
const markCyclicInputHandles = (graph: Graph, edges: Edge[]) => {
  // reset all handles to non-cyclic
  graph.nodes.forEach((node, nodeId) => {
    node.inputs.forEach(input => input.isCyclic = false);
    node.dynamicInputs?.forEach(input => input.isCyclic = false);
    graph.nodes.set(nodeId, node);
  });

  const traverseFromInputHandle = (currentNode: GenericNode, startNode: GenericNode, startInputHandlesName: string, visitedNodeIds: Set<string>) => {
    if (visitedNodeIds.has(currentNode.id)) {
      return;
    }
    const outputEdges = edges.filter(edge => edge.source === currentNode.id);
    const nextNodesAndHandleIds = outputEdges.map(edge => ({
      node: graph.nodes.get(edge.target),
      handleId: edge.targetHandle
    }));
    visitedNodeIds.add(currentNode.id);
    for (const nextNodesAndHandleId of nextNodesAndHandleIds) {
      const nextNode = nextNodesAndHandleId.node;
      if (nextNode === undefined) {
        continue;
      }
      const nextHandle = nextNode.inputs.concat(nextNode.dynamicInputs ?? []).find(input => input.id === nextNodesAndHandleId.handleId);
      if (nextNode.id === startNode.id && nextHandle?.name === startInputHandlesName) {
        nextNode.inputs
          .concat(nextNode.dynamicInputs || [])
          .filter(input => input.name === startInputHandlesName)
          .forEach(input => {
            input.isCyclic = true
          });
        return;
      }
      traverseFromInputHandle(nextNode, startNode, startInputHandlesName, visitedNodeIds);
    }
  }

  for (const node of graph.nodes.values()) {
    const uniqueInputHandleName = new Set(node.inputs.concat(node.dynamicInputs ?? []).map(input => input.name));
    for (const handleName of Array.from(uniqueInputHandleName)) {
      if (handleName === undefined) {
        continue;
      }
      traverseFromInputHandle(node, node, handleName, new Set());
    }
  }
}

export const validateGraph = (graph: Graph, edges: Edge[]): string => {
  const nodes = Array.from(graph.nodes.values());
  if (!nodes.some(node => [NodeType.OUTPUT, NodeType.ERROR].includes(node.type))) {
    return "Graph must have at least one output node";
  }
  if (!nodes.some(node => node.type === NodeType.INPUT)) {
    return "Graph must have at least one input node";
  }
  const disconnectedNodes = getDisconnectedNodes(graph, edges);
  if (disconnectedNodes.length > 0) {
    return `Nodes\n${disconnectedNodes.map(node => formatNode(node)).join(';\n')} are not connected`;
  }

  const nodesWithDisconnectedOutputHandles = getNodesWithDisconnectedOutputHandles(graph, edges);
  if (nodesWithDisconnectedOutputHandles.length > 0) {
    return `The following output handles are not connected:\n${nodesWithDisconnectedOutputHandles.map(node => formatNode(node)).join(';\n')}`;
  }

  const disconnectedInputHandles: Record<string, GenericNodeHandle[]> = Object.fromEntries(
    Array.from(graph.nodes.entries())
      .map(([nodeId, node]) => [nodeId, getDisconnectedInputHandles(node)])
      .filter(([_, handles]) => handles.length > 0)
  );
  if (Object.keys(disconnectedInputHandles).length > 0) {
    return `Nodes\n${Object.entries(disconnectedInputHandles).map(([nodeId, handles]) =>
      `${formatNodeById(graph, nodeId)} has disconnected handles: ${handles.map(handle => handle.name).join(', ')}`
    ).join(';\n')}`;
  }

  if (nodes.some(node => (node.type === NodeType.SUBPIPELINE) && !(node as SubpipelineNode).pipelineVersionId)) {
    return "All Subpipeline nodes must have a pipeline version selected";
  }

  for (const node of nodes) {
    if (node.type === NodeType.MAP) {
      if (!(node as MapNode).pipelineVersionId) {
        return "All Map nodes must have a pipeline version selected";
      }

      const inputNodes = Object.values((node as MapNode).runnableGraph.nodes).filter(node => node.type === NodeType.INPUT);
      if (inputNodes.length !== 1 || inputNodes[0].outputs[0].type !== NodeHandleType.STRING) {
        return "Map node's subpipeline must have exactly one input node of type String";
      }

      const outputNodes = Object.values((node as MapNode).runnableGraph.nodes).filter(node => node.type === NodeType.OUTPUT);
      if (outputNodes.length !== 1) {
        return "Map node's subpipeline must have exactly one output node of type String";
      }
    }

    if (node.type === NodeType.CODE) {
      for (const inp of (node as GenericNode).inputs) {
        if (inp.type === NodeHandleType.ANY) {
          return `Node ${node.name} has an input of type ANY, please specify the type`
        }
      }

      for (const out of (node as GenericNode).outputs) {
        if (out.type === NodeHandleType.ANY) {
          return `Node ${node.name} has an output of type ANY, please specify the type`
        }
      }
    }
  }

  markCyclicInputHandles(graph, edges);

  return GRAPH_VALID;
}

export const validateInputs = (allInputs: InputVariable[][]): string => {
  for (const [runIndex, inputs] of allInputs.entries()) {
    for (const input of inputs) {
      if (input.type === NodeHandleType.CHAT_MESSAGE_LIST) {
        if ((input.value as ChatMessage[]).length === 0) {
          return `Execution ${runIndex + 1}: Input "${input.name}" is empty, add at least one message`;
        }

        for (const message of input.value as ChatMessage[]) {
          if (!isStringType(message.content)) {
            if (message.content.length === 0) {
              return `Execution ${runIndex + 1}: One of the chat messages in input "${input.name}" is empty, add at least one content part, or change it to string type`;
            }
          }
        }
      }
    }
  }
  return GRAPH_VALID;
}

// Helper funcion to remove hash from node ids
// Will be removed once all pipelines are updated
export const removeHashFromId = (pipelineVersion: PipelineVersion) => {

  for (let node of pipelineVersion.displayableGraph.nodes) {
    node.id = node.id.split('_')[0];
  }

  for (let edge of pipelineVersion.displayableGraph.edges) {
    edge.source = edge.source.split('_')[0];
    edge.target = edge.target.split('_')[0];
  }
}
