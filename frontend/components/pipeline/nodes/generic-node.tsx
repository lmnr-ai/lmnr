import useStore from '@/lib/flow/store'
import { Handle, Position, type Connection, useUpdateNodeInternals, useOnSelectionChange, Node, Edge } from 'reactflow'
import { type GenericNode, NodeType, NodeHandleType } from '@/lib/flow/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useFlowContext } from '@/contexts/pipeline-version-context'
import { memo, useCallback, useEffect, useState } from 'react'
import { NODE_TYPE_TO_DOCS, createNodeData } from '@/lib/flow/utils'
import { Button } from '@/components/ui/button'
import { Info, Settings, Trash } from 'lucide-react'

interface GenericNodeComponentProps {
  id: string
  data: GenericNode
  children?: React.ReactNode;
  className?: string;
}

const GenericNodeComponent = ({ id, data, children }: GenericNodeComponentProps) => {

  const { getNode, updateNodeData, dropEdgeForHandle, edges, setNodes, setFocusedNodeId, focusedNodeId, highlightedNodeId } = useStore(state => state)
  const { editable } = useFlowContext()
  const [shouldUpdate, setShouldUpdate] = useState(false)
  const updateNodeInternals = useUpdateNodeInternals()
  const [nodeName, setNodeName] = useState(data.name)
  const [isSelected, setIsSelected] = useState(false)

  const onChange = useCallback(({ nodes, edges }: { nodes: Node[], edges: Edge[] }) => {

    if (nodes.length === 0) {
      setIsSelected(false)
      return
    }

    setIsSelected(nodes[0].id === id)

  }, [])


  useOnSelectionChange({
    onChange
  })

  useEffect(() => {
    updateNodeInternals(id)
    setNodeName(data.name)
  }, [data])

  useEffect(() => {
    const defaultData = createNodeData("", data.type)

    const newDataKeys = new Set(Object.keys(defaultData))
    const currentDataKeys = new Set(Object.keys(data))

    const missingKeys = Array.from(newDataKeys).filter(key => !currentDataKeys.has(key))

    if (defaultData.version !== data.version) {
      setShouldUpdate(true)
    }

    // model is now optional and can be disabled on LLM nodes.
    if (data.type === NodeType.LLM && missingKeys.length === 1 && missingKeys[0] === 'model') {
      return
    }

    setShouldUpdate(missingKeys.length > 0)
  }, [data])

  const isValidConnection = (connection: Connection) => {
    if (!connection.source || !connection.target) return false

    const sourceNode = getNode(connection.source)
    const targetNode = getNode(connection.target)

    const sourceHandleType = sourceNode?.data.outputs.find(output => output.id === connection.sourceHandle)?.type
    let targetHandleType = targetNode?.data.inputs.find(input => input.id === connection.targetHandle)?.type

    // when trying to connect to a dynamic input, the targetHandleType cannot be found in the node's inputs
    if (!targetHandleType) {
      targetHandleType = targetNode?.data.dynamicInputs?.find(input => input.id === connection.targetHandle)?.type
    }

    // if target handle is any, any connection is valid
    if (targetHandleType == NodeHandleType.ANY || sourceHandleType == NodeHandleType.ANY) return true

    return sourceHandleType === targetHandleType
  }

  // combine data.inputs and data.fixedInputs
  const inputs = data.inputs.concat(data.dynamicInputs?.map(input => {
    return {
      id: input.id,
      name: input.name,
      type: input.type,
    }
  }) ?? [])

  return (
    <>
      <div className={cn("transition-all absolute flex left-[2px] space-x-2 top-[-32px] w-72 items-center align-middle justify-center", isSelected ? "" : "hidden")}>
        <Button
          variant={'secondary'}
          className='border border-blue-300'
          onClick={() => {
            setFocusedNodeId(data.id);
          }}
        >
          <Settings size={14} />
        </Button>
        <Button
          variant={'secondary'}
          className={cn('border border-blue-300', editable ? '' : 'hidden')}
          onClick={() => {
            // delete this node
            for (const handle of inputs) {
              dropEdgeForHandle(handle.id)
            }
            for (const handle of data.outputs) {
              dropEdgeForHandle(handle.id)
            }

            if (focusedNodeId === id) {
              setFocusedNodeId(null)
            }

            setNodes((nodes) => {
              return nodes.filter((node) => {
                return node.id !== id
              })
            })
          }}
        >
          <Trash size={14} />
        </Button>
      </div>
      <div className={cn(
        "z-0 transition-all flex items-center border-2 rounded-md border-transparent",
        !editable ? "pointer-events-none" : "",
        isSelected ? 'border-2 border-blue-300' : '',
        highlightedNodeId === data.id ? 'border-2 border-blue-300' : '',
      )}>
        <div className={cn("w-72 bg-background border rounded-md")}>
          <div className="flex flex-col">
            <div
              className="h-8 space-x-1 text-xs font-medium p-2 flex rounded-t-md items-center border-b bg-secondary"
            // style={{ backgroundColor: NODE_TYPE_TO_COLOR[data.type] }}
            >
              {data.type}
              <div className='flex-1'></div>
              {NODE_TYPE_TO_DOCS[data.type] && <a target="_blank" href={NODE_TYPE_TO_DOCS[data.type]}>
                <Info size={14} className="cursor-pointer hover:bg-black hover:bg-opacity-0" />
              </a>}
            </div>
            <div className={cn("flex", data.collapsed ? "w-60" : "")}>
              <div className="font-medium w-full">
                <div className='flex flex-col p-2 space-y-2'>
                  {
                    shouldUpdate ? (
                      <div>
                        <div className="text-xs text-red-500">This node version is outdated.
                        </div>
                        <Button
                          className='text-xs'
                          variant={'destructive'}
                          onClick={() => {

                            const defaultData = createNodeData("", data.type) as any

                            const newDataKeys = new Set(Object.keys(defaultData))
                            const currentDataKeys = new Set(Object.keys(data))

                            const missingKeys = Array.from(newDataKeys).filter(key => !currentDataKeys.has(key))

                            const obsoleteKeys = Array.from(currentDataKeys).filter(key => !newDataKeys.has(key))

                            // add missing keys with default values amd remove obsolete keys
                            const newData: any = {
                              ...data,
                              ...Object.fromEntries(missingKeys.map(key => [key, defaultData[key]])),
                            }

                            obsoleteKeys.forEach(key => delete newData[key])

                            // drop all edges connected to this node
                            for (const handle of data.inputs.concat(data.dynamicInputs ?? []).concat(data.outputs)) {
                              dropEdgeForHandle(handle.id)
                            }
                            // update inputs and outputs
                            newData.inputs = defaultData.inputs
                            newData.outputs = defaultData.outputs

                            updateNodeData(id, newData)

                            updateNodeInternals(id);
                            setShouldUpdate(false)
                          }}
                        >
                          Update node
                        </Button>
                      </div>
                    ) : null
                  }
                  <Label>Node name</Label>
                  <Input
                    key={id}
                    placeholder="Name of the node"
                    className="w-full nodrag nowheel"
                    value={nodeName}
                    onChange={e => {
                      setNodeName(e.currentTarget.value)
                      updateNodeData(id, { name: e.currentTarget.value } as GenericNode)
                    }}
                    spellCheck={false}
                  />
                  {children}
                </div>
                <div className='flex'>
                  <div className={'z-10 flex flex-1 min-w-[50%] flex-col justify-center space-y p-2 pt-0 border-t' + (inputs.length > 0 ? '' : ' hidden')}>
                    {
                      inputs.map((input, i) =>
                        <div key={i} className=''>
                          <Label className='text-xs text-gray-500'>{input.type} {input.secondType ? ' | ' + input.secondType : ''}</Label>
                          <div className="flex items-center relative">
                            <Handle
                              type="target"
                              id={input.id}
                              position={Position.Left}
                              style={{
                                position: 'absolute',
                                left: '-14px',
                                width: '12px',
                                height: '12px',
                                border: '2px',
                                borderColor: '#AB3E65',
                                borderStyle: 'solid',
                                backgroundColor: '#F08F6B'
                              }}
                              isValidConnection={isValidConnection}
                            />
                            <div className="text-xs w-full text-left truncate">{input.name}</div>
                          </div>
                        </div>
                      )
                    }
                  </div>
                  <div className={'flex flex-1 flex-col justify-center min-w-[50%] space-y border-t p-2 pt-0' + (data.outputs.length > 0 ? '' : ' hidden')}>
                    {
                      data.outputs.map((output, i) =>
                      (
                        <div key={i} className='text-right'>
                          <Label className='text-xs text-gray-500'>
                            {output.type}
                          </Label>
                          <div className="flex items-center relative" key={i}>
                            <div className="text-xs w-full truncate">
                              {output.name ? output.name : "output"}
                            </div>
                            <Handle
                              type="source"
                              id={output.id}
                              position={Position.Right}
                              style={{
                                position: 'absolute',
                                width: '12px',
                                right: '-15px',
                                height: '12px',
                                border: '2px',
                                borderColor: '#AB3E65',
                                borderStyle: 'solid',
                                backgroundColor: '#F08F6B'
                              }}
                              className='h-4 w-4 rounded-full mt-[1px] border-2'
                              isValidConnection={isValidConnection}
                            />
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default memo(GenericNodeComponent)
