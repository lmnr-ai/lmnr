import React, { useEffect, useState } from 'react'
import { SpanCard } from '../traces/trace-card'
import { getDuration, getDurationString, renderNodeInput } from '@/lib/flow/utils'
import { ScrollArea } from '../ui/scroll-area'
import { Label } from '../ui/label'
import { RunTrace } from '@/lib/traces/types'
import StatusLabel from '../ui/status-label'
import { CircleDollarSign, Clock3, Coins, FastForward, Loader, Play } from 'lucide-react'
import { StreamMessage } from './pipeline-outputs'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { Skeleton } from '../ui/skeleton'
import Formatter from '../ui/formatter'
import { Button } from '../ui/button'
import { v4 } from 'uuid'
import { ConditionValue, NodeType } from '@/lib/flow/types'
import useStore from '@/lib/flow/store'
import eventEmitter from '@/lib/pipeline/eventEmitter'
import { GraphMessagePreview } from '@/lib/pipeline/types'
import { cn } from '@/lib/utils'

interface StreaTraceProps {
  streamMessages: StreamMessage[]
  runTrace?: RunTrace
  onNodeRun?: (startMessage: StreamMessage) => void
}

export default function StreamTrace({ streamMessages, runTrace, onNodeRun }: StreaTraceProps) {

  const { highlightNode } = useStore()
  const [selectedMessage, setSelectedMessage] = useState<StreamMessage | null>(null)

  useEffect(() => {
    if (selectedMessage) {
      setSelectedMessage(streamMessages.find(m => m.id === selectedMessage.id) || null)
    } else if (streamMessages.some(node => node.reachedBreakpoint)) {
      setSelectedMessage(streamMessages.find(node => node.reachedBreakpoint) || null)
    }

  }, [streamMessages])

  const status = () => {

    // if any stream message has reached breakpoint
    if (streamMessages.some(node => node.reachedBreakpoint)) {
      return 'Breakpoint'
    }

    return streamMessages.length > 0 ? 'Running' : "Idle"
  }

  return (
    <div className='flex h-full w-full border border-l-0'>
      <div className='flex flex-col'>
        <div className='p-4 flex space-x-2 border-b items-center'>
          {runTrace && (
            <>
              <StatusLabel success={runTrace?.success} />
              <div className='flex space-x-1 items-center'>
                <Clock3 size={12} />
                <Label className='text-secondary-foreground text-sm'>{getDurationString(runTrace?.startTime, runTrace?.endTime)}</Label>
              </div>
              <div className='flex space-x-1 items-center'>
                <Coins size={12} />
                <Label className='text-secondary-foreground text-sm'>{runTrace.totalTokenCount}</Label>
              </div>
              <div className='flex space-x-1 items-center'>
                <CircleDollarSign size={12} />
                <Label className='text-secondary-foreground text-sm'>{runTrace.approximateCost !== null ? `${runTrace.approximateCost.toFixed(5)}$` : "-"}</Label>
              </div>
            </>
          )}
          {!runTrace && (
            <>
              <div className='flex justify-start'>
                <div className='bg-blue-300/20 px-2 h-[18px] flex justify-start border-blue-500/60 border text-blue-400 font-medium text-xs rounded'>
                  {status()}
                </div>
              </div>
              <div className='flex space-x-1 items-center'>
                <Clock3 size={12} />
                <Label className='text-secondary-foreground text-sm'>-</Label>
              </div>
              <div className='flex space-x-1 items-center'>
                <Coins size={12} />
                <Label className='text-secondary-foreground text-sm'>-</Label>
              </div>
              <div className='flex space-x-1 items-center'>
                <CircleDollarSign size={12} />
                <Label className='text-secondary-foreground text-sm'>-</Label>
              </div>
            </>
          )
          }
        </div>
        <ScrollArea className='flex overflow-auto'>
          <div className='p-4 pt-0 relative min-w-72'>
            {
              streamMessages.map((streamMessage, index) => (
                <div
                  key={streamMessage.id}
                  className='w-full'
                  onClick={() => setSelectedMessage(streamMessage)}
                  onMouseEnter={() => highlightNode(streamMessage.nodeId)}
                  onMouseLeave={() => highlightNode(undefined)}
                >
                  <div className='pl-4 cursor-pointer'>
                    {streamMessage.message &&
                      <TraceCard key={index} message={streamMessage.message!} selected={streamMessage.id === selectedMessage?.id} breakpoint={selectedMessage?.reachedBreakpoint} />
                    }
                    {!streamMessage.message && <StreamTraceCard node={streamMessage} selected={streamMessage.id === selectedMessage?.id} showSpinner={!runTrace} />
                    }
                  </div>
                  <div
                    className='border-l-2 border-b-2 rounded-bl-lg absolute w-4 top-[-16px] left-4'
                    style={{
                      height: 30 + index * (24 + 16)
                    }}
                  />
                </div>
              ))
            }
          </div>
        </ScrollArea>
      </div>
      <div className='flex-grow flex flex-col border-l'>
        <Tabs
          className='flex flex-col flex-grow'
          defaultValue='output'
        >
          <div className='border-b flex-none'>
            <div className='flex flex-none h-12 items-center px-4 space-x-2'>
              {selectedMessage && (
                <>
                  <div className="p-1 px-2 text-xs text-secondary-foreground rounded bg-secondary">{selectedMessage.nodeType}</div>
                  <div>{selectedMessage.nodeName}</div>
                  <div className='pl-2'>
                    {runTrace && selectedMessage.nodeType !== NodeType.INPUT &&
                      (<Button
                        variant='secondary'
                        className='h-6'
                        onClick={() => {

                          if (!selectedMessage) {
                            return
                          }

                          let messages = streamMessages.map(node => node.message!)

                          // updating message ids
                          for (const message of messages) {

                            if (!message) {
                              continue;
                            }

                            const oldId = message.id
                            const newId = v4()

                            if (typeof message?.value === 'object' && (message?.value as ConditionValue).value) {
                              message.value = (message?.value as ConditionValue).value
                            }

                            if (message?.inputMessageIds.includes(oldId)) {
                              message.inputMessageIds = message.inputMessageIds.map(id => id === oldId ? newId : id)
                            }

                            message.id = newId
                            const now = new Date();
                            const nowISO = now.toISOString()
                            message.startTime = nowISO;
                            message.endTime = nowISO;

                          }


                          onNodeRun?.(selectedMessage)

                        }}
                      >
                        <Play size={12} />
                      </Button>
                      )}
                    {
                      selectedMessage?.reachedBreakpoint && (
                        <Button
                          variant='secondary'
                          className='h-6'
                          onClick={() => {
                            eventEmitter.emit('graph', 'continue')
                            selectedMessage.reachedBreakpoint = false
                          }}
                        >
                          <FastForward size={14} />
                        </Button>
                      )
                    }
                  </div>
                </>
              )}
            </div>
            <TabsList className="border-none text-sm px-4">
              <TabsTrigger value="output">Output</TabsTrigger>
              <TabsTrigger value="inputs">Inputs</TabsTrigger>
            </TabsList>
          </div>
          <div className='flex-grow'>
            <TabsContent
              value="output"
              className='h-full w-full mt-0'
            >
              <div className='flex h-full w-full'>
                <ScrollArea className='flex overflow-auto w-full mt-0'>
                  {selectedMessage && (
                    <div className='flex max-h-0'>
                      <div className='p-4 w-full h-full'>
                        <div className='border rounded'>
                          <Formatter value={renderNodeInput(selectedMessage.message ? selectedMessage.message.value : selectedMessage.value)} />
                        </div>
                      </div>
                    </div>
                  )}
                </ScrollArea>
              </div>
            </TabsContent>
            <TabsContent
              value="inputs"
              className='h-full w-full mt-0'
            >
              <div className='flex h-full w-full'>
                <ScrollArea className='flex overflow-auto w-full'>
                  <div className="flex max-h-0">
                    <div className="p-4 flex w-full h-full flex-col space-y-4">
                      {
                        !selectedMessage?.message?.value && (
                          <div>
                            <Skeleton className="h-8" />
                          </div>
                        )

                      }
                      {selectedMessage?.message?.inputMessageIds && (
                        selectedMessage.message.inputMessageIds.map((id, index) => {
                          const node = streamMessages.find(node => node.message?.id === id)

                          return (
                            <div key={index} className='flex flex-col space-y-2'>
                              <div className='text-sm text-secondary-foreground'>{node?.nodeName}</div>
                              <div className="rounded border">
                                <Formatter value={renderNodeInput(node?.message?.value || "")} />
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                </ScrollArea>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  )
}


interface StreamTraceCardProps {
  node: StreamMessage
  selected?: boolean
  showSpinner?: boolean
}


function StreamTraceCard({ node, selected, showSpinner = true }: StreamTraceCardProps) {

  return (
    <div className="mt-4 border-none relative"
    >
      {selected && (
        <div className='absolute left-[-32px] right-[-16px] top-[-8px] bottom-[-8px] bg-blue-400/10 z-0 border-l-2 border-blue-400'>
        </div>
      )}
      <div className="flex space-x-2 items-center">
        <div className="p-1 px-2 text-xs text-secondary-foreground rounded bg-secondary">{node.nodeType}</div>
        <div className='overflow-hidden text-ellipsis whitespace-nowrap text-sm'>{node.nodeName}</div>
        {showSpinner && <div>
          <Loader className='text-secondary-foreground animate-spin' size={12} />
        </div>
        }
      </div>
    </div >
  )
}


interface TraceCardProps {
  message: GraphMessagePreview
  selected?: boolean
  onTraceHover?: (nodeId?: string) => void
  breakpoint?: boolean
}

export function TraceCard({ message, selected, onTraceHover, breakpoint = false }: TraceCardProps) {
  return (
    <div
      className="mt-4 border-none relative transition-all"
      onMouseEnter={() => { onTraceHover?.(message.nodeId) }}
      onMouseLeave={() => { onTraceHover?.(undefined) }}
    >
      {selected && (
        <div className={cn('absolute left-[-32px] right-[-16px] top-[-8px] bottom-[-8px] z-0 border-l-2', breakpoint ? 'bg-yellow-200/10 border-yellow-500' : 'border-blue-400 bg-blue-400/10')}>
        </div>
      )}
      <div className='text-md flex items-center w-full'>
        <div className="flex w-full items-center space-x-2">
          <div className="p-1 px-2 text-xs text-secondary-foreground rounded bg-secondary">{message.nodeType}</div>
          <div className='text-ellipsis overflow-hidden whitespace-nowrap text-sm max-w-full'>{message.nodeName}</div>
          <Label className='text-secondary-foreground'>{getDurationString(message.startTime, message.endTime)}</Label>
        </div>
      </div>
    </div >
  )
}