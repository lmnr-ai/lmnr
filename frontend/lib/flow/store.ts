import { create } from 'zustand'
import {
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  addEdge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  type ReactFlowInstance,
  XYPosition
} from 'reactflow'
import { type GenericNode, type NodeData } from './types'
import { Graph } from './graph'
import { InputVariable } from '../pipeline/types'
import * as Y from 'yjs'

// duplicating here because we can't export enums
enum PipelineExecutionMode {
  Pipeline = 'pipeline',
  Node = 'node',
}

interface RFState {
  ydoc: Y.Doc
  nodes: Node[]
  edges: Edge[]
  isMissingEnvVars: boolean
  breakpointNodeIds: string[]
  setIsMissingEnvVars: (isMissingEnvVars: boolean) => void
  focusedNodeId: string | null,
  mode: PipelineExecutionMode,
  allInputs: InputVariable[][]
  // used to trigger a run of the pipeline
  // managed via state to avoid prop drilling
  highlightedNodeId: string | undefined
  getNode: (id: string) => NodeData | undefined
  getNodes: () => Node[]
  getEdges: () => Edge[]
  setNodes: (f: ((nodes: Node[]) => Node[])) => void
  setEdges: (f: ((edges: Edge[]) => Edge[])) => void
  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
  onConnect: OnConnect
  updateNodeData: (nodeId: string, data: GenericNode) => void
  getGraph: () => Graph
  getRunGraph: () => Graph
  dropEdgeForHandle: (handleId: string) => void
  setFocusedNodeId: (id: string | null) => void
  setAllInputs: (inputs: InputVariable[][]) => void
  setMode: (mode: PipelineExecutionMode) => void
  highlightNode: (nodeId?: string) => void
  syncNodesWithYDoc: () => void
  setBreakpointNodeIds: (f: (ids: string[]) => string[]) => void
}

const useStore = create<RFState>()((set, get) => ({
  ydoc: new Y.Doc(),
  rf: {} as ReactFlowInstance,
  nodes: [],
  edges: [],
  isMissingEnvVars: false,
  breakpointNodeIds: [],
  setIsMissingEnvVars: (isMissingEnvVars: boolean) => {
    set({ isMissingEnvVars: isMissingEnvVars })
  },
  focusedNodeId: null,
  mode: PipelineExecutionMode.Pipeline,
  allInputs: [[]],
  triggerRun: false,
  highlightedNodeId: undefined,
  getNode: (id: string) => {
    return get().nodes.find((node) => node.id === id)
  },
  getNodes: () => {
    return get().nodes
  },
  getEdges: () => {
    return get().edges
  },
  setNodes: (f: ((nodes: Node[]) => Node[])) => {

    const newNodes = f(get().nodes)
    const ynodes = get().ydoc.getMap('nodes')

    for (let node of newNodes) {

      const ynode = new Y.Map()

      ynode.set('id', node.id)
      ynode.set('type', node.type)
      ynode.set('position', node.position)
      ynode.set('data', node.data)

      ynodes.set(node.id, ynode)

    }



    // remove nodes that are not in the new list
    for (const key of ynodes.keys()) {
      if (!newNodes.find((node) => node.id === key)) {
        ynodes.delete(key)
      }
    }

    set({ nodes: newNodes })
  },
  setEdges: (f: ((edges: Edge[]) => Edge[])) => {

    const newEdges = f(get().edges)

    const yedges = get().ydoc.getMap('edges')

    // remove edges that are not in the new list
    for (const key of yedges.keys()) {
      if (!newEdges.find((edge) => edge.id === key)) {
        yedges.delete(key)
      }
    }

    for (let edge of newEdges) {
      yedges.set(edge.id, edge)
    }

    set({ edges: newEdges })
  },
  onNodesChange: (changes: NodeChange[]) => {

    for (let change of changes) {

      if (change.type === 'position' && change.position) {
        const ynode = get().ydoc.getMap('nodes').get(change.id) as any
        ynode.set('position', change.position)
      }
    }

    set({
      nodes: applyNodeChanges(changes, get().nodes)
    })
  },
  onEdgesChange: (changes: EdgeChange[]) => {

    for (let change of changes) {
      if (change.type === 'add') {
        get().ydoc.getMap('edges').set(change.item.id, change.item)
      } else if (change.type === 'remove') {
        get().ydoc.getMap('edges').delete(change.id)
      }
    }

    set({
      edges: applyEdgeChanges(changes, get().edges)
    })
  },
  onConnect: (connection: Connection) => {
    const newEdges = addEdge(connection, get().edges)

    const yedges = get().ydoc.getMap('edges')
    for (let edge of newEdges) {
      yedges.set(edge.id, edge)
    }

    set({
      edges: newEdges
    })
  },
  updateNodeData: (nodeId: string, data: GenericNode) => {

    const ynode = get().ydoc.getMap('nodes').get(nodeId) as any

    set({
      nodes: get().nodes.map((node) => {
        if (node.id === nodeId || node.id.includes(nodeId)) {
          node.data = { ...node.data, ...data }
          ynode.set('data', node.data)
        }
        return node
      })
    })
  },
  getGraph: () => {
    const graph = new Graph()
    get().nodes.forEach((node) => {
      graph.addNode(node.data)
    })

    get().edges.forEach((edge) => {
      graph.addEdge(edge.source.split('_')[0], edge.target.split('_')[0], edge.sourceHandle!, edge.targetHandle!)
    })

    return graph
  },
  getRunGraph: () => {

    if (get().focusedNodeId && get().mode === PipelineExecutionMode.Node) {
      const focusedNode = get().nodes.find((node) => node.id === get().focusedNodeId)
      return Graph.fromNode(focusedNode?.data ?? {})
    }

    const graph = new Graph()
    get().nodes.forEach((node) => {
      graph.addNode(node.data)
    })

    get().edges.forEach((edge) => {
      graph.addEdge(edge.source.split('_')[0], edge.target.split('_')[0], edge.sourceHandle!, edge.targetHandle!)
    })

    return graph
  },
  dropEdgeForHandle: (handleId: string) => {

    const newEdges = get().edges.filter((edge) => edge.sourceHandle !== handleId && edge.targetHandle !== handleId)

    // remove edge from yedges
    const yedges = get().ydoc.getMap('edges')

    // remove edges that are not in the new list
    for (const key of yedges.keys()) {
      if (!newEdges.find((edge) => edge.id === key)) {
        yedges.delete(key)
      }
    }

    set({
      edges: newEdges
    })
  },
  setFocusedNodeId: (id: string | null) => {
    set({ focusedNodeId: id })
  },
  setAllInputs: (inputs: InputVariable[][]) => {
    set({ allInputs: inputs })
  },
  setMode: (mode: PipelineExecutionMode) => {
    set({ mode: mode })
  },
  highlightNode: (nodeId?: string) => {
    set({ highlightedNodeId: nodeId })
  },
  syncNodesWithYDoc: () => {
    const ynodes = get().ydoc.getMap('nodes')

    const currentNodes = get().nodes
    const nodes = Array.from(ynodes.values()).map((ynode: any) => {
      const newNode = {
        ...currentNodes.find((node) => node.id === ynode.get('id')),
        id: ynode.get('id'),
        data: ynode.get('data'),
        type: ynode.get('type'),
        position: ynode.get('position')
      }
      return newNode
    })

    const edges = Array.from(get().ydoc.getMap('edges').values()) as Edge[]

    set({ nodes: nodes })
    set({ edges: edges })

  },
  setBreakpointNodeIds: (f: (ids: string[]) => string[]) => {
    set({ breakpointNodeIds: f(get().breakpointNodeIds) })
  }
}))

export default useStore
