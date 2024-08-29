'use client'

import { useContext, useEffect, useState, useRef, useMemo } from 'react'
import Flow from './flow'
import PipelineTrace from './pipeline-trace'
import PipelineHeader from './pipeline-header'
import { ProjectContext } from '@/contexts/project-context'
import useStore from '@/lib/flow/store'
import { Label } from '../ui/label'
import { InputVariable, Pipeline, PipelineExecutionMode, PipelineVersion } from '@/lib/pipeline/types'
import { FlowContextProvider } from '@/contexts/pipeline-version-context'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { ImperativePanelHandle } from 'react-resizable-panels'
import { useToast } from '@/lib/hooks/use-toast'
import Toolbar from './pipeline-toolbar'
import { STORED_INPUTS_STATE_UNSEEN, cn, convertAllStoredInputsToUnseen, convertStoredInputToUnseen, getStoredInputs, setStoredInputs } from '@/lib/utils'
import { Graph } from '@/lib/flow/graph'
import { createClient } from '@supabase/supabase-js'
import { useUserContext } from '@/contexts/user-context'
import { Skeleton } from '../ui/skeleton'
import PipelineBottomPanel from './pipeline-bottom-panel'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/const'
import { PresenceUser } from '@/lib/user/types'
import { v4 as uuidv4 } from 'uuid'
import PipelineSheet from './pipeline-sheet'
import { InputNode, NodeType } from '@/lib/flow/types'
import { DEFAULT_INPUT_VALUE_FOR_HANDLE_TYPE } from '@/lib/flow/utils'
import { Button } from '../ui/button'
import { ChevronsRight, PlayIcon, StopCircle } from 'lucide-react'
import { removeHashFromId } from '@/lib/pipeline/utils'
import { ScrollArea } from '../ui/scroll-area'
import { usePrevious } from '@/lib/hooks/use-previous'
import Header from '../ui/header'
import { Switch } from '../ui/switch'
import * as Y from 'yjs'
import eventEmitter from '@/lib/pipeline/eventEmitter'

interface PipelineProps {
  pipeline: Pipeline;
  defaultSelectedVersion?: PipelineVersion;
}

export const dynamic = 'force-dynamic'

const AUTO_SAVE_TIMEOUT_MS = 750;

enum RunGraphState {
  Run = "run",
  Idle = "idle"
}

export default function Pipeline({ pipeline }: PipelineProps) {

  const [bottomPanelMinSize, setBottomPanelMinSize] = useState(0)
  const { projectId } = useContext(ProjectContext)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [runGraphState, setRunGraphState] = useState<RunGraphState>(RunGraphState.Idle)

  // default to latest WORKSHOP pipeline version
  const [selectedPipelineVersion, setSelectedPipelineVersion] = useState<PipelineVersion | null>(null)
  const {
    ydoc,
    syncNodesWithYDoc,
    mode,
    setMode,
    setNodes,
    setEdges,
    getNodes,
    getEdges,
    getGraph,
    getRunGraph,
    nodes,
    edges,
    focusedNodeId,
    setFocusedNodeId,
    allInputs,
    setAllInputs,
    breakpointNodeIds,
    setBreakpointNodeIds,
  } = useStore(state => state)

  const autoSaveFuncTimeoutId = useRef<NodeJS.Timeout | null>(null);
  const externalUpdateTimeoutId = useRef<NodeJS.Timeout | null>(null);
  const [unsavedChanges, setUnsavedChanges] = useState<boolean>(false);
  const [isUpdatingByAnotherClient, setIsUpdatingByAnotherClient] = useState<boolean>(false);
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([])
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const flowPanelRef = useRef<ImperativePanelHandle>(null);
  const channel = useRef<any>(null);
  const isFirstRender = useRef(true);
  const presenceId = useRef(uuidv4());
  const seenClientIds = useRef<string[]>([]);
  const { toast } = useToast();

  const { supabaseAccessToken, username, imageUrl } = useUserContext()

  const supabase = useMemo(() => createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${supabaseAccessToken}`,
        },
      },
    }
  ), [])

  supabase.realtime.setAuth(supabaseAccessToken)

  useEffect(() => {
    document.title = `${pipeline.name}`

    if (window?.innerHeight) {
      setBottomPanelMinSize((46 / (window.innerHeight - 100)) * 100)
    }

    eventEmitter.on('run', (action) => {
      if (action === 'cancel' || action === 'done') {
        setRunGraphState(RunGraphState.Idle)
      } else if (action === 'run') {
        setRunGraphState(RunGraphState.Run)
      }
    })

    // remove all channels on unmount
    return () => {
      supabase.removeAllChannels()
      setFocusedNodeId(null)
    }
  }, [])

  const handleDocUpdate = (update: Uint8Array, origin: any) => {

    // don't sync for commit pipelines
    if (selectedPipelineVersion?.pipelineType === 'COMMIT') {
      return;
    }

    if (origin === 'external') {
      syncNodesWithYDoc()
      return;
    }

    if (channel.current) {
      channel.current.send({
        type: 'broadcast',
        event: 'graph',
        payload: {
          pipelineVersionId: selectedPipelineVersion!.id,
          diff: Array.from(update)
        },
      })
    }

  }

  useEffect(() => {
    setIsSheetOpen(focusedNodeId !== null)
  }, [focusedNodeId])

  const updateSelectedPipelineVersion = (versionId: string) => {
    setFocusedNodeId(null)
    fetch(`/api/projects/${projectId}/pipelines/${pipeline.id}/versions/${versionId}`, {
      method: 'GET',
      cache: 'no-store'
    }).then(res => res.json()).then(pipelineVersion => {
      removeHashFromId(pipelineVersion)
      setSelectedPipelineVersion(pipelineVersion)
    })
  }

  const saveVersion = async (
    rf: any,
    graph: Graph,
    projectId: string,
    selectedPipelineVersion: PipelineVersion,
  ) => {
    return await fetch(
      `/api/projects/${projectId}/pipelines/${selectedPipelineVersion.pipelineId}/versions/${selectedPipelineVersion.id}`,
      {
        method: 'POST',
        body: JSON.stringify({
          ...selectedPipelineVersion,
          displayableGraph: rf,
          runnableGraph: graph.toObject()
        }),
        cache: 'no-store',
      }
    );
  }

  const autoSave = async (
    projectId: string,
    selectedPipelineVersion: PipelineVersion
  ) => {

    const rf = {
      nodes: getNodes(),
      edges: getEdges()
    };

    const graph = getGraph();

    const res = await saveVersion(rf, graph, projectId, selectedPipelineVersion);
    if (!res.ok) {
      toast({
        title: 'Error saving pipeline version',
        variant: 'destructive'
      })
    }

    setUnsavedChanges(false);
  }

  useEffect(() => {

    // reset seen client ids on pipeline change
    seenClientIds.current = [];
    setPresenceUsers([]);

    isFirstRender.current = true;

    if (selectedPipelineVersion === null) return

    if (selectedPipelineVersion.displayableGraph == undefined) {
      return
    }

    // First time, we read all inputs (for pipeline and all node graphs) from the storage
    convertAllStoredInputsToUnseen(selectedPipelineVersion!.id!);

    // updating nodes and edges from selected pipeline version
    const flow = selectedPipelineVersion.displayableGraph

    setNodes((_) => flow.nodes)
    setEdges((_) => flow.edges)

    const currentPresenceUser: PresenceUser = {
      id: presenceId.current,
      username: username,
      imageUrl: imageUrl
    };

    // don't setup listener for commit pipelines
    if (selectedPipelineVersion.pipelineType === 'COMMIT') {
      return;
    }

    // setting up listener for changes on selected pipeline version
    const newChannel = supabase.channel('pipeline_versions_' + selectedPipelineVersion.id!)
    channel.current = newChannel
      .on('presence', { event: 'sync' }, () => {
        const newState = channel.current.presenceState();
        const presenceUsers = Object.values(newState).map((u: any) => ({ id: u[0].id, username: u[0].username, imageUrl: u[0].imageUrl })).filter((user) => {
          return user.id != currentPresenceUser.id;
        }).sort((user1, user2) => { return user1.id.localeCompare(user2.id) });
        setPresenceUsers(presenceUsers);
      })
      .on('broadcast', { event: 'graph' }, handleExternalGraphUpdate)
      .on('broadcast', { event: 'sync' }, handleInitialSync)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          channel.current.send({
            type: 'broadcast',
            event: 'sync',
            payload: {
              senderId: presenceId.current,
              pipelineVersionId: selectedPipelineVersion.id,
              diff: Array.from(Y.encodeStateAsUpdate(ydoc))
            },
          })
          await newChannel.track(currentPresenceUser)

        }
      })


    ydoc.on('update', handleDocUpdate)

    return () => {

      newChannel.unsubscribe()
      ydoc.off('update', handleDocUpdate)
    }


  }, [selectedPipelineVersion])

  const handleInitialSync = (e: any) => {
    const payload = e.payload as { senderId: string, pipelineVersionId: string, diff: Int8Array };

    // don't sync for commit pipelines
    if (selectedPipelineVersion?.pipelineType === 'COMMIT' || payload.pipelineVersionId !== selectedPipelineVersion?.id) {
      return;
    }

    if (payload.diff) {
      const diff = new Uint8Array(payload.diff)

      Y.applyUpdate(ydoc, diff, "external")

      // if we haven't seen this client id yet, we send our state
      if (seenClientIds.current.indexOf(payload.senderId) === -1) {
        seenClientIds.current.push(payload.senderId)

        channel.current.send({
          type: 'broadcast',
          event: 'sync',
          payload: {
            pipelineVersionId: selectedPipelineVersion!.id,
            senderId: presenceId.current,
            diff: Array.from(Y.encodeStateAsUpdate(ydoc))
          },
        })

      }
    }
  }


  useEffect(() => {

    if (isFirstRender.current === true) {
      // skip autosave on first render and add some latency to avoid save on immediate next render
      setTimeout(() => {
        isFirstRender.current = false;
      }, 100);
      return;
    }

    if (isUpdatingByAnotherClient) {
      return;
    }

    if (selectedPipelineVersion === null) {
      return
    }

    // don't autosave endpoint pipelines
    if (selectedPipelineVersion.pipelineType === 'COMMIT') {
      return;
    }

    if (autoSaveFuncTimeoutId.current) {
      clearTimeout(autoSaveFuncTimeoutId.current);
    }

    autoSaveFuncTimeoutId.current = setTimeout(
      async () => await autoSave(projectId, selectedPipelineVersion),
      AUTO_SAVE_TIMEOUT_MS
    );
    setUnsavedChanges(true);

  }, [nodes, edges])

  const handleExternalGraphUpdate = (e: any) => {

    setIsUpdatingByAnotherClient(true);

    const payload = e.payload as {
      pipelineVersionId: string,
      diff: Int8Array
    };

    if (payload.diff && payload.pipelineVersionId === selectedPipelineVersion?.id) {
      const diff = new Uint8Array(payload.diff)
      Y.applyUpdate(ydoc, diff, "external")
    }

    // add some latency to avoid flickering during simultaneous updates
    if (externalUpdateTimeoutId.current) {
      clearTimeout(externalUpdateTimeoutId.current);
    }

    externalUpdateTimeoutId.current = setTimeout(() => {
      setIsUpdatingByAnotherClient(false);
    }, 500);

  }

  const prevFocusedNodeId = usePrevious(focusedNodeId);
  const prevMode = usePrevious(mode);

  useEffect(() => {
    if (!selectedPipelineVersion) return;

    // The node may be focused, but if we're not in Node execution mode, we're still working with whole pipeline's inputs.
    let storeFocusedNodeId = (mode === PipelineExecutionMode.Node) ? focusedNodeId : null;
    setStoredInputs(selectedPipelineVersion.id!, storeFocusedNodeId, allInputs);
  }, [allInputs])

  // Update allInputs when nodes change
  useEffect(() => {

    if (!selectedPipelineVersion) return;

    if (mode === PipelineExecutionMode.Node && prevMode === PipelineExecutionMode.Pipeline) {
      convertStoredInputToUnseen(selectedPipelineVersion.id!, null);
    } else if (mode === PipelineExecutionMode.Pipeline && prevMode === PipelineExecutionMode.Node) {
      convertStoredInputToUnseen(selectedPipelineVersion.id!, focusedNodeId as any);
    } else if (mode === PipelineExecutionMode.Node && focusedNodeId !== prevFocusedNodeId) {
      // This accounts for the case when we switch between focused nodes with "Unit test" mode on
      convertStoredInputToUnseen(selectedPipelineVersion.id!, prevFocusedNodeId as any);
    }

    let inputNodes: InputNode[] = [];
    if (mode === PipelineExecutionMode.Node && focusedNodeId) {
      inputNodes = Array.from(getRunGraph().nodes.values()).filter(node => node.type === NodeType.INPUT) as InputNode[];
    } else {

      // Define the type for inputNodes
      inputNodes = nodes.reduce((acc: InputNode[], node) => {
        if (node.type === NodeType.INPUT) {
          acc.push(node.data as InputNode);
        }
        return acc;
      }, []);
    }

    let localPipelineInputs;
    if (mode === PipelineExecutionMode.Node && focusedNodeId) {
      localPipelineInputs = getStoredInputs(selectedPipelineVersion.id!, focusedNodeId);
    } else {
      localPipelineInputs = getStoredInputs(selectedPipelineVersion.id!, null);
    }

    let currentInputs: InputVariable[][];
    if (localPipelineInputs.state === STORED_INPUTS_STATE_UNSEEN) {
      if (localPipelineInputs.inputs.length === 0) {
        const newPipelineInputs = inputNodes.map(inputNode => {
          return {
            id: inputNode.id,
            name: inputNode.name,
            value: DEFAULT_INPUT_VALUE_FOR_HANDLE_TYPE[inputNode.inputType],
            type: inputNode.inputType,
            executionId: uuidv4() // Added new execution
          };
        });
        currentInputs = [newPipelineInputs];
      } else {
        currentInputs = localPipelineInputs.inputs;
      }
    } else {
      currentInputs = allInputs;
    }

    const newAllInputs: InputVariable[][] = currentInputs.map(inputs => {
      // Must be uniquely identified, index among all executions is not enough since some executions may be deleted
      const executionId = (inputs.length > 0) ? inputs[0].executionId : uuidv4();

      return inputNodes.map(inputNode => {
        let input;
        if (mode === PipelineExecutionMode.Node && focusedNodeId) {
          // we check by name if focusedNodeId is set
          // because when we create graph from node, inputs nodes are regenerated
          // and their ids are different, but names are the same
          input = inputs.find(input => input.name === inputNode.name);
        } else {
          input = inputs.find(input => input.id === inputNode.id);
        }

        // if input is present we reuse its value
        // otherwise we create a new input with default value
        if (input) {

          // if type was changed for the same input, we update value to default
          if (input.type !== inputNode.inputType) {
            return {
              id: inputNode.id,
              name: inputNode.name,
              value: DEFAULT_INPUT_VALUE_FOR_HANDLE_TYPE[inputNode.inputType],
              type: inputNode.inputType,
              executionId,
            }
          } else {
            return {
              id: inputNode.id,
              name: inputNode.name,
              value: input.value,
              type: inputNode.inputType,
              executionId,
            }
          }
        } else {
          return {
            id: inputNode.id,
            name: inputNode.name,
            value: DEFAULT_INPUT_VALUE_FOR_HANDLE_TYPE[inputNode.inputType],
            type: inputNode.inputType,
            executionId,
          };
        }
      })
    });

    // allInputs is stored in store as a convenience, so that we don't always pass pipeline version id and focusedNodeId
    setAllInputs(newAllInputs);
  }, [nodes, focusedNodeId, mode]);

  const sheetRef = useRef<ImperativePanelHandle>(null);

  return (
    <div className="pipeline flex flex-col h-full w-full">
      <Header path={"pipelines/" + pipeline.name}>
        <PipelineHeader
          selectedPipelineVersion={selectedPipelineVersion}
          pipeline={pipeline}
          unsavedChanges={unsavedChanges}
          onPipelineVersionSelect={(version) => {
            supabase.removeAllChannels()
            updateSelectedPipelineVersion(version.id)
          }}
          onPipelineVersionSave={() => {
            autoSave(projectId, selectedPipelineVersion!).then(() => {
              toast({
                title: 'Pipeline version saved',
                duration: 1000
              })
            })
          }}
          onLeftPanelOpenChange={(open) =>
            setLeftPanelOpen(open)
          }
          onRightPanelOpenChange={(open) =>
            setRightPanelOpen(open)
          }
          presenceUsers={presenceUsers}
        />
      </Header>
      <div className="flex flex-grow h-full">
        <div className={cn('h-full flex flex-col', leftPanelOpen ? 'w-[22vw] border-r ' : 'w-0')}>
          <div className='p-4'>

            {selectedPipelineVersion?.pipelineType === 'COMMIT'
              && <div><Label className='text-purple-400'>Commit version</Label></div>}
            <div className='border rounded p-2 py-1'>
              {selectedPipelineVersion?.name}
            </div>
            {
              selectedPipelineVersion?.pipelineType === 'COMMIT' &&
              <Label className='text-gray-500 font-mono text-xs'>{selectedPipelineVersion?.id}</Label>
            }
          </div>
          <div className="flex flex-none h-14 justify-between items-center p-4 border-b">
            <h4 className="text-base font-medium">
              {
                mode === PipelineExecutionMode.Node ? 'Node execution' : 'Pipeline execution'
              }
            </h4>
            {runGraphState === RunGraphState.Idle &&
              (<Button
                onClick={() => {
                  if (flowPanelRef.current && flowPanelRef.current.getSize() > 90) {
                    flowPanelRef.current?.resize(50)
                  }
                  eventEmitter.emit('graph', 'run');
                  setRunGraphState(RunGraphState.Run)
                }}
                disabled={selectedPipelineVersion == null}
                handleKeys={[{ key: 'Enter', ctrlKey: true }, { key: 'Enter', metaKey: true }]}
              >
                <PlayIcon className="" size={16} />
              </Button>
              )
            }
            {
              runGraphState === RunGraphState.Run &&
              (<Button
                onClick={() => {

                  eventEmitter.emit('graph', 'cancel');
                  setRunGraphState(RunGraphState.Idle)
                }}

              >
                <StopCircle size={16} />
              </Button>
              )
            }

          </div>
          {selectedPipelineVersion && (
            <PipelineTrace />
          )
          }

        </div>
        <div className="content-view flex flex-grow flex-col h-full">
          <ResizablePanelGroup direction="vertical">
            <ResizablePanel collapsible collapsedSize={0} ref={flowPanelRef}>
              <div className='flex h-full relative'>
                <ResizablePanelGroup direction='horizontal'>
                  <ResizablePanel className='flex'>
                    <div className='flex-1 relative z-10'>
                      {selectedPipelineVersion && (
                        <FlowContextProvider editable={selectedPipelineVersion.pipelineType === "WORKSHOP"}>
                          <Flow key={selectedPipelineVersion.id} />
                        </FlowContextProvider>
                      )}
                      {!selectedPipelineVersion && (
                        <Skeleton className='h-full w-full rounded-none' />
                      )
                      }
                    </div>
                    <ScrollArea className={cn("flex-none", rightPanelOpen ? 'w-52' : 'w-0', isSheetOpen ? 'hidden' : '')} type='always'>
                      <Toolbar editable={selectedPipelineVersion?.pipelineType === "WORKSHOP"} />
                    </ScrollArea>
                  </ResizablePanel>
                  <ResizableHandle />
                  {isSheetOpen && (
                    <ResizablePanel className='flex w-full' minSize={40} ref={sheetRef}>
                      <div className="bg-background w-full">
                        <div className='flex flex-col relative w-full h-full'>
                          <div className='h-12 pl-3 items-center flex flex-none border-b justify-between space-x-4'>
                            <button
                              className=""
                              onClick={() => {
                                setIsSheetOpen(false)
                                setFocusedNodeId(null)
                                setMode(PipelineExecutionMode.Pipeline)
                              }}
                            >
                              <ChevronsRight />
                            </button>
                            <div className='flex'>
                              <div className='flex items-center text-secondary-foreground space-x-2 pr-4'>
                                <div className='whitespace-nowrap'>
                                  Breakpoint
                                </div>
                                <Switch
                                  checked={breakpointNodeIds.includes(focusedNodeId as string)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setBreakpointNodeIds((prev) => [...prev, focusedNodeId as string])
                                    } else {
                                      setBreakpointNodeIds((prev) => prev.filter((id) => id !== focusedNodeId))
                                    }
                                  }}
                                />
                              </div>
                              <div className='flex items-center text-secondary-foreground space-x-2 pr-4'>
                                <div className='whitespace-nowrap'>
                                  Unit test
                                </div>
                                <Switch
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      sheetRef.current?.resize(100)
                                      setMode(PipelineExecutionMode.Node)
                                    } else {
                                      sheetRef.current?.resize(50)
                                      setMode(PipelineExecutionMode.Pipeline)
                                    }
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                          <PipelineSheet editable={selectedPipelineVersion?.pipelineType === "WORKSHOP"} />
                        </div>
                      </div>
                    </ResizablePanel>
                  )}
                </ResizablePanelGroup>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle className='border-t z-50' />
            <ResizablePanel defaultSize={bottomPanelMinSize} minSize={bottomPanelMinSize} className='z-40 h-full'>
              <PipelineBottomPanel flowPanelRef={flowPanelRef} pipelineVersion={selectedPipelineVersion ?? {} as PipelineVersion} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    </div>
  )
}
