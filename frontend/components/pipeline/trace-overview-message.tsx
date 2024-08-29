import { renderNodeInput } from "@/lib/flow/utils";
import Ide from "../ui/ide";
import { useEffect, useState } from "react";
import { Skeleton } from "../ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { ScrollArea } from "../ui/scroll-area";
import { RunTrace } from "@/lib/traces/types";
import { GraphMessage } from "@/lib/pipeline/types";
import { useProjectContext } from "@/contexts/project-context";
import SpanEvents from "../traces/span-events";
import Formatter from "../ui/formatter";

interface TraceMessageProps {
  trace: RunTrace;
  enableFeedback: boolean;
}

export function TraceOverviewMessage({ trace, enableFeedback }: TraceMessageProps) {
  const { projectId } = useProjectContext();
  const [selectedTab, setSelectedTab] = useState<'output' | 'inputs' | 'feedback'>('output')

  const [outputs, setOutputs] = useState<GraphMessage[] | null>(null);
  const [inputs, setInputs] = useState<GraphMessage[] | null>(null);

  useEffect(() => {
    const outputIds = trace.outputMessageIds;

    Promise.all(outputIds.map(async (id) => {
      const res = await fetch(`/api/projects/${projectId}/trace-messages/${id}`, {
        cache: 'default'
      })
      return await res.json()
    })).then((outputs) => {
      setOutputs(outputs)
    })
  }, [trace])

  useEffect(() => {
    const inputIds = Object.values(trace.messagePreviews).filter((preview) => preview.inputMessageIds.length === 0).map((preview) => preview.id);

    Promise.all(inputIds.map(async (id) => {
      const res = await fetch(`/api/projects/${projectId}/trace-messages/${id}`, {
        cache: 'default'
      })
      return await res.json()
    })).then((inputs) => {
      setInputs(inputs)
    })
  }, [trace])

  return (
    <>
      <Tabs
        className='flex flex-col flex-grow'
        defaultValue='output'
        onValueChange={(value) => setSelectedTab(value as 'output' | 'inputs' | 'feedback')}
      >
        <div className='border-b flex-none'>
          <div className='flex flex-none h-12 items-center px-4 space-x-2'>
            <div>Trace overview</div>
          </div>
          <TabsList className="border-none text-sm px-4">
            <TabsTrigger value="output">Output</TabsTrigger>
            <TabsTrigger value="inputs">Inputs</TabsTrigger>
            {enableFeedback && <TabsTrigger value="feedback">Feedback</TabsTrigger>}
          </TabsList>
        </div>
        <div className='flex-grow'>
          <TabsContent
            value="output"
            className='h-full w-full mt-0'
            forceMount
            hidden={selectedTab !== 'output'}
          >
            <div className='flex h-full w-full'>
              <ScrollArea className='flex overflow-auto w-full'>
                <div className="flex max-h-0">
                  <div className="p-4 flex w-full h-full flex-col space-y-4">
                    {
                      !outputs && (
                        <div>
                          <Skeleton className="h-8" />
                        </div>
                      )
                    }
                    {outputs && (
                      outputs.map((output: GraphMessage, index: number) => (
                        <div key={index} className='flex flex-col space-y-2'>
                          <div className='text-sm text-secondary-foreground'>{output.nodeName}</div>
                          <Formatter value={renderNodeInput(output.value)} />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </ScrollArea>
            </div>
          </TabsContent>
          <TabsContent
            value="inputs"
            className='h-full w-full mt-0'
            forceMount
            hidden={selectedTab !== 'inputs'}
          >
            <div className='flex h-full w-full'>
              <ScrollArea className='flex overflow-auto w-full'>
                <div className="flex max-h-0">
                  <div className="p-4 flex w-full h-full flex-col space-y-4">
                    {!inputs && (
                      <div>
                        <Skeleton className="h-8" />
                      </div>
                    )}
                    {inputs &&
                      (inputs.map((input: GraphMessage, index: number) => (
                        <div key={index} className='flex flex-col space-y-2'>
                          <div className='text-sm text-secondary-foreground'>{input.nodeName}</div>
                          <Formatter value={renderNodeInput(input.value)} />
                        </div>
                      ))
                      )}
                  </div>
                </div>
              </ScrollArea>
            </div>
          </TabsContent>
          <TabsContent
            value="feedback"
            className='h-full w-full mt-0'
            forceMount
            hidden={selectedTab !== 'feedback'}
          >
            <div className='flex h-full w-full'>
              <ScrollArea className='flex overflow-auto w-full'>
              </ScrollArea>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </>
  )
}
