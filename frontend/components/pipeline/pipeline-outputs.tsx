import { useEffect, useRef, useState } from "react"
import useStore from "@/lib/flow/store"
import { useProjectContext } from "@/contexts/project-context"
import { useToast } from '../../lib/hooks/use-toast';
import { useCallback } from 'react';
import { GRAPH_VALID, validateGraph, validateInputs } from "@/lib/pipeline/utils"
import { getLocalDevSessions, getLocalEnvVars } from "@/lib/utils"
import { BreakpointChunk, GraphMessage, InputVariable, NodeStreamChunk, PipelineVersion } from "@/lib/pipeline/types"
import { Graph } from "@/lib/flow/graph"
import { NodeInput, NodeType } from "@/lib/flow/types"
import { createParser, type ParsedEvent, type ReconnectInterval } from 'eventsource-parser'
import StreamTrace from "./stream-trace"
import { RunTrace } from "@/lib/traces/types";
import { v4 } from "uuid";
import eventEmitter from "@/lib/pipeline/eventEmitter";


export type StreamMessage = {
  id: string
  nodeType: NodeType
  nodeId: string
  nodeName: string
  // the value which dynamically gets filled out during stream
  value: string
  // the final value after stream is done
  message?: GraphMessage
  reachedBreakpoint?: boolean
}

function findMostRecentStreamMessage(streamMessages: StreamMessage[], id: string): StreamMessage | null {
  for (let i = streamMessages.length - 1; i >= 0; i--) {
    if (streamMessages[i].nodeId === id) {
      return streamMessages[i];
    }
  }
  return null;
}

interface PipelineOutputsProps {
  pipelineVersion: PipelineVersion;
}


export default function PipelineOutputs({ pipelineVersion }: PipelineOutputsProps) {
  const { toast } = useToast();

  let { projectId } = useProjectContext()

  const runId = useRef(v4());
  const startMessage = useRef<StreamMessage | null>(null);
  const [streamMessages, setStreamMessages] = useState<StreamMessage[]>([])
  const [runTrace, setRunTrace] = useState<RunTrace | undefined>(undefined)

  const { getRunGraph, getEdges, allInputs, focusedNodeId, setIsMissingEnvVars, breakpointNodeIds } = useStore()

  const [error, setError] = useState<string | undefined>(undefined)

  const showError = useCallback((message: string) => {
    toast({ title: "Pipeline running error", variant: 'destructive', description: message, duration: 10000 })
  }, [])


  const onParse = async (event: ParsedEvent | ReconnectInterval) => {
    let type = (event as ParsedEvent).event;
    let content = JSON.parse((event as ParsedEvent).data).content;
    switch (type) {
      case 'Breakpoint': {
        const breakpoint = content as BreakpointChunk

        setStreamMessages((prev) => {
          const node = findMostRecentStreamMessage(prev, breakpoint.nodeId);
          if (node !== null) {
            return prev.map((n) => {
              if (n.nodeId === breakpoint.nodeId) {
                return {
                  ...n,
                  reachedBreakpoint: true
                }
              }
              return n;
            })
          } else {
            throw new Error(`Breakpoint received for node ${breakpoint.nodeId} but no NodeChunk found`);
          }
        });

        break;
      }
      case 'NodeChunk': {

        let chunk = content as NodeStreamChunk;
        const nodeId = chunk.nodeId
        const nodeType = chunk.nodeType

        if (nodeType === NodeType.CONDITION) {
          break;
        };

        setStreamMessages((prev) => {

          const message = findMostRecentStreamMessage(prev, nodeId);
          // if node is not found, create a new one
          // if found node is not completed, append the chunk to the value
          if (message !== null && !message.message) {
            return prev.map((n) => {
              if (n.id === message.id) {
                return {
                  ...n,
                  value: n.value + content.content
                }
              }
              return {
                ...n
              }
            })

          } else {
            return [...prev, {
              id: v4(),
              nodeId: nodeId,
              nodeName: content.nodeName,
              value: content.content,
              nodeType: content.nodeType
            }]
          }
        });
        break;
      }
      case 'NodeEnd': {
        if (content.message.nodeType === NodeType.CONDITION) {
          break;
        };

        const nodeId = content.message.nodeId;

        setStreamMessages((prev) => {
          const message = findMostRecentStreamMessage(prev, nodeId);
          if (message !== null) {
            return prev.map((n) => {
              if (n.id === message.id) {
                return {
                  ...n,
                  message: content.message
                }
              }
              return n;
            })
          } else {
            throw new Error(`NodeEnd received for node ${nodeId} but no NodeChunk found`);
          }
        });
        break;
      }
      case 'RunTrace':
        setRunTrace(content);
        break;
      case 'Error':
        setError(content);
        break;
    };
  }

  useEffect(() => {
    eventEmitter.on('graph', handleGraphEvent);

    return () => {
      eventEmitter.off('graph', handleGraphEvent);
    }
  }, [pipelineVersion, allInputs, breakpointNodeIds])


  const handleGraphEvent = (content: string) => {
    if (content === 'run') {
      runGraph();
    } else if (content === 'cancel') {
      interruptRun('Cancel');
    } else if (content === 'continue') {
      interruptRun('Continue');
    }
  }

  const interruptRun = async (message: string) => {

    const response = await fetch(`/api/projects/${projectId}/pipelines/interrupt/graph`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        runId: runId.current,
        interruptMessage: message
      })
    });

    if (!response.ok) {
      setError(await response.text());
      return;
    }

  }

  const runGraph = async () => {

    setError(undefined);
    const graph = getRunGraph();

    // validate edges if no node is focused
    if (!focusedNodeId) {
      const edges = getEdges();

      const graphValidStatus = validateGraph(graph, edges);
      if (graphValidStatus !== GRAPH_VALID) {
        showError(`Pipeline is not valid: ${graphValidStatus}`);
        eventEmitter.emit('run', 'cancel');
        return;
      }
    }

    const inputsValidStatus = validateInputs(allInputs);
    if (inputsValidStatus !== GRAPH_VALID) {
      showError(inputsValidStatus);
      eventEmitter.emit('run', 'cancel');
      return;
    }

    const requiredEnvVars = graph.requiredEnvVars();
    const envVars = getLocalEnvVars(projectId);
    for (const envVar of requiredEnvVars) {
      if (!envVars[envVar]) {
        setIsMissingEnvVars(true);
        setTimeout(() => {
          // hack to make it triggerable next time the button is clicked
          setIsMissingEnvVars(false);
        }, 1000);
        return
      }
    };

    const devSessionIds = getLocalDevSessions(projectId);

    // copying all messages to send prefilled in case start task is set
    const allMessages = streamMessages.map((m) => {
      return {
        ...m.message
      }
    })

    if (startMessage.current !== null) {
      let prefilledMessages = []

      for (const m of streamMessages) {

        const message = {
          ...m
        }

        prefilledMessages.push(message);

        if (message.message && message.id === startMessage.current.id) {
          message.value = ""
          message.message = undefined;
          break;
        }

      }

      setStreamMessages(prefilledMessages);
    } else {
      setStreamMessages([]);
    }

    // convert inputs to map name -> value
    const inputMap = new Map<string, NodeInput>();
    allInputs[0].forEach((input) => inputMap.set(input.name, input.value!));
    const inputVars = Object.fromEntries(inputMap.entries());

    runId.current = v4();
    setRunTrace(undefined);

    const response = await fetch(`/api/projects/${projectId}/pipelines/run/graph`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        runId: runId.current,
        graph: graph.toObject(),
        inputs: inputVars,
        env: envVars,
        breakpointTaskIds: breakpointNodeIds,
        pipelineVersionId: pipelineVersion.id!,
        prefilledMessages: startMessage.current ? allMessages : null,
        startTaskId: startMessage.current?.nodeId,
        devSessionIds
      })
    });

    if (!response.ok) {
      setError(await response.text());
      return;
    }

    const reader = response.body!.getReader();
    const parser = createParser(onParse);
    let done, value;
    while (!done) {
      ({ value, done } = await reader.read());
      if (value) {
        const text = new TextDecoder().decode(value);
        parser.feed(text);
      }
      if (done) {
        break;
      }
    }
    parser.reset(); // Need to reset to use for another stream of events
    eventEmitter.emit('run', 'done');
    startMessage.current = null;

    // reset breakpoint info
    setStreamMessages((prev) => {
      return prev.map((n) => {
        return {
          ...n,
          reachedBreakpoint: false
        }
      })
    });
  }

  return (
    <>
      <div className="h-full flex w-full">
        <div className="flex h-full w-full">
          {!error && <StreamTrace
            streamMessages={streamMessages}
            runTrace={runTrace}
            onNodeRun={(message) => {
              startMessage.current = message;
              runGraph();
              eventEmitter.emit('run', 'run');
            }} />
          }
          {error &&
            <div className="flex p-4 items-center justify-center w-ful">
              <div className="p-4 border rounded">
                Error:
                <h4 className="text-base text-white whitespace-pre-wrap">{error}</h4>
              </div>
            </div>
          }
        </div>
      </div>
    </>
  )

}