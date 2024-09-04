import { useCallback, useRef, type DragEvent, useState } from 'react'
import 'reactflow/dist/style.css'
import ReactFlow, {
  ConnectionLineType,
  Background,
  type Edge,
  type Connection,
  updateEdge,
  type Node,
  MarkerType
} from 'reactflow'


import InputNodeComponent from './nodes/input-node'
import OutputNodeComponent from './nodes/output-node'
import GenericNodeComponent from './nodes/generic-node'

import useStore from '@/lib/flow/store'
import { NodeType } from '@/lib/flow/types'
import { v4 as uuidv4 } from 'uuid'
import { createNodeData } from '@/lib/flow/utils'
import { useFlowContext } from '@/contexts/pipeline-version-context'
import CustomEdge from './nodes/components/custom-edge'

const nodeTypes = {
  [NodeType.INPUT]: InputNodeComponent,
  [NodeType.SEMANTIC_SEARCH]: GenericNodeComponent,
  [NodeType.OUTPUT]: OutputNodeComponent,
  [NodeType.ERROR]: GenericNodeComponent,
  [NodeType.STRING_TEMPLATE]: GenericNodeComponent,
  [NodeType.SUBPIPELINE]: GenericNodeComponent,
  [NodeType.MAP]: GenericNodeComponent,
  [NodeType.ZENGUARD]: GenericNodeComponent,
  [NodeType.SEMANTIC_SWITCH]: GenericNodeComponent,
  [NodeType.FORMAT_VALIDATOR]: GenericNodeComponent,
  [NodeType.EXTRACTOR]: GenericNodeComponent,
  [NodeType.JSON_EXTRACTOR]: GenericNodeComponent,
  [NodeType.LLM]: GenericNodeComponent,
  [NodeType.WEB_SEARCH]: GenericNodeComponent,
  [NodeType.SWITCH]: GenericNodeComponent,
  [NodeType.CODE]: GenericNodeComponent,
  [NodeType.TOOL_CALL]: GenericNodeComponent,
  [NodeType.FUNCTION]: GenericNodeComponent,
  [NodeType.SEMANTIC_SIMILARITY]: GenericNodeComponent,
  [NodeType.CODE_SANDBOX]: GenericNodeComponent,
}

const defaultEdgeOptions = {
  type: 'custom',
  markerEnd: { type: MarkerType.ArrowClosed },
}

const edgeTypes = {
  custom: CustomEdge,
};

function Flow() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null)
  const {
    nodes,
    edges,
    setNodes,
    setEdges,
    onNodesChange,
    onEdgesChange,
    onConnect,
  } = useStore()
  const edgeUpdateSuccessful = useRef(true)
  const { editable } = useFlowContext()

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback((event: DragEvent) => {
    event.preventDefault()

    const nodeType: string = event.dataTransfer.getData('application/reactflow')

    const position = reactFlowInstance!.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY
    })

    const nodeId = uuidv4()
    const nodeData = createNodeData(nodeId, nodeType as NodeType)
    nodeData.inputsMappings = {}


    const newNode: Node = {
      data: nodeData,
      id: nodeId,
      type: nodeType,
      position
    }

    setNodes((nodes) => nodes.concat(newNode))
  }, [reactFlowInstance])

  const onEdgeUpdateStart = useCallback(() => {
    edgeUpdateSuccessful.current = false
  }, [])

  const onEdgeUpdate = useCallback((oldEdge: Edge, newConnection: Connection) => {
    edgeUpdateSuccessful.current = true
    updateEdge(oldEdge, newConnection, edges)
  }, [])

  const onEdgeUpdateEnd = useCallback((_: any, edge: Edge) => {
    if (!edgeUpdateSuccessful.current) {
      setEdges((eds) => eds.filter((e) => e.id !== edge.id))
    }
    edgeUpdateSuccessful.current = true
  }, [])

  return (
    <ReactFlow className="bg-gray-50 w-full h-full"
      ref={reactFlowWrapper}
      nodes={nodes}
      onNodesChange={onNodesChange}
      edges={edges}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      defaultEdgeOptions={defaultEdgeOptions}
      connectionLineType={ConnectionLineType.Bezier}
      onEdgeUpdateStart={onEdgeUpdateStart}
      onEdgeUpdate={onEdgeUpdate}
      onEdgeUpdateEnd={onEdgeUpdateEnd}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onInit={setReactFlowInstance}
      minZoom={0.1}
      maxZoom={5}
      fitView
      deleteKeyCode={null}
      onEdgeMouseEnter={(_event, edge) => {
        setEdges((edges) => edges.map((e) => {
          if (e.id === edge.id) {
            return { ...e, data: { ...e.data, isHover: true } }
          }
          return e
        }))
      }}
      onEdgeMouseLeave={(_event, edge) => {
        setEdges((edges) => edges.map((e) => {
          if (e.id === edge.id) {
            return { ...e, data: { ...e.data, isHover: false } }
          }
          return e
        }))

      }}
      edgesFocusable={editable}
      edgesUpdatable={editable}
      nodesDraggable={editable}
    >
      <Background className='bg-background brightness-125 text-foreground/5' gap={16} />
    </ReactFlow>
  )
}

export default Flow
