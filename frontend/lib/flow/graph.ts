import { v4 } from 'uuid'
import { type GenericNode, NodeHandleType, NodeType, type OutputNode, InputNode, ConditionNode, GenericNodeHandle } from './types'
import { getRequiredEnvVars } from '@/lib/env/utils'
import { GraphMessagePreview } from '../pipeline/types'
import { TraceMessages } from '../traces/types'

export class Graph {
  nodes: Map<string, GenericNode>
  pred: Map<string, Set<string>>

  constructor() {
    this.nodes = new Map()
    this.pred = new Map()
  }

  addNode(node: GenericNode) {
    // resets inputsMappings, as they are set in addEdge
    // be sure to call addEdge AFTER addNode
    const newNode = { ...node, inputsMappings: {} } as GenericNode;

    if (newNode.isCondtional === true) {

      const outputHandleId = v4()

      newNode.outputs = [{
        id: outputHandleId,
        type: NodeHandleType.STRING
      } as GenericNodeHandle]

      for (let i = 0; i < node.outputs.length; i++) {

        const output = node.outputs[i]

        // it is safe to force unwrap here because we know that if there's more than 1 output, it has a name
        const conditionNode: ConditionNode = {
          id: v4(),
          name: output.name!,
          type: NodeType.CONDITION,
          inputs: [{
            id: v4(),
            name: 'input',
            type: NodeHandleType.STRING
          } as GenericNodeHandle],
          outputs: [{
            id: output.id,
            type: NodeHandleType.STRING
          } as GenericNodeHandle],
          condition: output.name!,
          inputsMappings: {}
        };

        this.nodes.set(conditionNode.id, conditionNode)
        this.addEdge(node.id, conditionNode.id, outputHandleId, conditionNode.inputs[0].id)
      }
    }

    this.nodes.set(node.id, newNode)
  }

  addEdge(from: string, to: string, fromHandle: string, toHandle: string) {
    if (!this.pred.has(to)) {
      this.pred.set(to, new Set())
    }

    if (this.nodes.get(from)?.isCondtional === true) {

      // for router nodes, we add extra condition node in between
      const conditionNode = Array.from(this.nodes.values()).find((node) =>
        node.type === NodeType.CONDITION && node.outputs[0].id === fromHandle
      )
      this.pred.get(to)?.add(conditionNode?.id!)

    } else {
      this.pred.get(to)?.add(from)
    }
    const targetNode: GenericNode = this.nodes.get(to)!

    const targetInputs = targetNode.inputs.concat(targetNode.dynamicInputs?.map(input => {
      return {
        ...input,
      }
    }) ?? [])

    // it means we have a connection between two nodes that already have a connection
    // in this case create new handle for the target node
    if (targetNode.inputsMappings![toHandle] !== undefined) {

      // if (targetInputs.find((input) => input.id === fromHandle) !== undefined) {
      //   return
      // }

      const handle = targetInputs.find((input) => input.id === toHandle)!;

      const newHandle = {
        id: v4(),
        type: handle.type,
        name: handle.name,
      }

      if (targetNode.dynamicInputs?.find((input) => input.id === toHandle) !== undefined) {
        targetNode.dynamicInputs = targetNode.dynamicInputs?.concat(newHandle)
      } else {
        targetNode.inputs = targetNode.inputs.concat(newHandle)
      }

      targetNode.inputsMappings = {
        ...targetNode.inputsMappings,
        [newHandle.id]: fromHandle
      }

    } else {

      targetNode.inputsMappings = {
        ...targetNode.inputsMappings,
        [toHandle]: fromHandle
      }
    }
  }

  toObject() {
    const arrayPred: Record<string, string[]> = {}

    this.pred.forEach((value, key) => {
      arrayPred[key] = Array.from(value)
    })

    const nodes = {} as Record<string, GenericNode>

    for (const key of Array.from(this.nodes.keys())) {
      const node = this.nodes.get(key)!
      nodes[node.id] = node
    }

    return {
      nodes,
      pred: arrayPred
    }
  }

  // Note: this is to run only one node as a singletion graph; it
  // may be incompatible with the current implementation now that addNode resets inputsMappings
  static fromNode(node: GenericNode) {

    const graph = new Graph()
    graph.addNode({ ...node })

    const allInputs = node.inputs.concat(node.dynamicInputs || [])

    for (const input of allInputs) {
      // input has to have a name, otherwise edge would not be created. So we can safely use ! here

      const inputNode: InputNode = {
        id: v4(),
        name: input.name!,
        type: NodeType.INPUT,
        inputs: [],
        inputType: input.type,
        outputs: [{
          id: v4(),
          type: input.type
        }]
      }

      graph.addNode(inputNode)
      graph.addEdge(inputNode.id, node.id, inputNode.outputs[0].id, input.id)

    }

    for (const output of node.outputs) {

      const outputNode: OutputNode = {
        id: v4(),
        name: 'output',
        type: NodeType.OUTPUT,
        inputs: [{
          id: v4(),
          name: 'output',
          type: output.type
        }],
        inputType: output.type,
        outputs: []
      }

      graph.addNode(outputNode)
      graph.addEdge(node.id, outputNode.id, node.outputs[0].id, outputNode.inputs[0].id)
    }

    return graph
  }

  requiredEnvVars(): Set<string> {
    return getRequiredEnvVars(Array.from(this.nodes.values()));
  }

}

export const traverseGraph = (messages: TraceMessages, startMsgId: string, list: GraphMessagePreview[] = []) => {
  const message = messages[startMsgId];
  if (!message || message.nodeName === null) {
    return
  }

  if (message.inputMessageIds?.length > 0) {
    message.inputMessageIds.forEach((msgId: string) => {
      traverseGraph(messages, msgId, list)
    })
  }

  if (!list.find((m) => m.id === message.id) && message.nodeType != NodeType.CONDITION) {
    list.push(message)
  }

}
