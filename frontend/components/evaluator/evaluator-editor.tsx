import { LabelClass, Span } from '@/lib/traces/types';
import { ScrollArea } from '../ui/scroll-area';
import Formatter from '../ui/formatter';
import { useProjectContext } from '@/contexts/project-context';
import { Button } from '../ui/button';
import { createNodeData, renderNodeInput } from '@/lib/flow/utils';
import { useEffect, useRef, useState } from 'react';
import { CodeNode, LLMNode, NodeHandleType, NodeType } from '@/lib/flow/types';
import { v4 } from 'uuid';
import { Graph } from '@/lib/flow/graph';
import { Play, Loader2 } from 'lucide-react';
import CodeEditor from '../ui/code-editor';
import { Label } from '../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { DialogClose } from '../ui/dialog';
import { toast } from '@/lib/hooks/use-toast';

interface AutoEvalsProps {
  span: Span;
  labelClass: LabelClass;
  onEvaluatorAdded?: (evaluatorRunnableGraph: Graph) => void;
}

export function EvaluatorEditor({ span, labelClass, onEvaluatorAdded }: AutoEvalsProps) {

  const { projectId } = useProjectContext();
  const [evalType, setEvalType] = useState<'LLM' | 'CODE'>('LLM');
  const [code, setCode] = useState<string>('def main(span_input, span_output):\n    return True');
  const [prompt, setPrompt] = useState<string>('');
  const [inputs, setInputs] = useState<string>('');
  const [output, setOutput] = useState<string>('');
  const runnableGraph = useRef<Graph | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    setInputs(`{
      "span_input": ${JSON.stringify(renderNodeInput(span.input))},
      "span_output": ${JSON.stringify(renderNodeInput(span.output))}
    }`);
  }, [span]);

  useEffect(() => {

    if (!labelClass.evaluatorRunnableGraph) {
      return;
    }

    const graph = Graph.fromObject(labelClass.evaluatorRunnableGraph as any);
    runnableGraph.current = graph;

    if (graph) {
      const codeNode = Array.from(graph.nodes.values()).find((node) => node.type === NodeType.CODE) as CodeNode;
      if (codeNode) {
        setCode(codeNode.code);
        setEvalType('CODE');
      }
      const llmNode = Array.from(graph.nodes.values()).find((node) => node.type === NodeType.LLM) as LLMNode;
      if (llmNode) {
        setPrompt(llmNode.prompt);
        setEvalType('LLM');
      }
    }

  }, [labelClass.evaluatorRunnableGraph]);

  const runGraph = async () => {
    console.log(process.env.OPENAI_API_KEY);
    const response = await fetch(`/api/projects/${projectId}/pipelines/run/graph`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        runId: v4(),
        graph: runnableGraph.current?.toObject(),
        inputs: JSON.parse(inputs),
        env: {
          "OPENAI_API_KEY": process.env.OPENAI_API_KEY
        },
        breakpointTaskIds: [],
        pipelineVersionId: v4(),
        devSessionIds: [],
        stream: false
      })
    });

    if (!response.ok) {
      setIsRunning(false);
      toast({
        title: 'Error',
        description: 'Failed to run evaluator',
        variant: 'destructive',
      });
    }

    const res = await response.json();
    try {
      setOutput(res["outputs"]["output"]["value"]);
    } catch (e) {
      setOutput(JSON.stringify(res));
    }
  };

  const updateCodeRunnableGraph = (code: string) => {

    const node = createNodeData(v4(), NodeType.CODE) as CodeNode;
    node.code = code;
    node.fnName = 'main';
    node.inputs = [
      {
        id: v4(),
        name: 'span_input',
        type: NodeHandleType.STRING
      },
      {
        id: v4(),
        name: 'span_output',
        type: NodeHandleType.STRING
      }
    ];
    const graph = Graph.fromNode(node);
    runnableGraph.current = graph;
  };

  const updateLLMRunnableGraph = (prompt: string) => {

    const node = createNodeData(v4(), NodeType.LLM) as LLMNode;
    node.prompt = prompt;
    node.model = 'openai:gpt-4o-mini';
    node.structuredOutputEnabled = true;
    node.structuredOutputSchema = `class Output {
  reasoning string @description("Reasoning for the value.")
  value string @description("One of ${labelClass.valueMap.join(', ')}.")
}`;
    node.structuredOutputSchemaTarget = 'Output';
    node.dynamicInputs = [
      {
        id: v4(),
        name: 'span_input',
        type: NodeHandleType.STRING
      },
      {
        id: v4(),
        name: 'span_output',
        type: NodeHandleType.STRING
      }
    ];

    const graph = Graph.fromNode(node);
    runnableGraph.current = graph;
  };

  const runEval = async () => {
    setIsRunning(true);
    try {
      if (evalType === 'CODE') {
        await runGraph();
      } else if (evalType === 'LLM') {
        await runGraph();
      } else {
        throw new Error('Invalid evaluator type');
      }
    } finally {
      setIsRunning(false);
    }
  };


  return (
    <div className="flex flex-col h-full w-full" >
      <div className="flex h-full space-x-4 w-full flex-grow">
        <div className="flex-1 items-center flex p-4 pr-0">
          <div className='flex flex-col h-full w-full flex-grow'>
            <div className="pb-2 font-medium text-lg flex-none">
              Input
            </div>
            <div className="flex-grow relative">
              <div className="absolute inset-0 overflow-auto">
                <Formatter
                  defaultMode="json"
                  value={inputs}
                  editable={true}
                  onChange={(value) => setInputs(value)}
                />
              </div>
            </div>
          </div>
        </div>
        <div className='flex-1 flex flex-col space-y-2'>
          <Tabs
            className="flex flex-col flex-grow"
            value={evalType} onValueChange={(value) => setEvalType(value as 'LLM' | 'CODE')}
          >
            <div className="flex-none pt-4 pr-4">
              <h1 className="text-lg">Evaluator for {labelClass.name}</h1>
              <TabsList className="mb-4 flex-none">
                <TabsTrigger value="LLM">LLM as a judge</TabsTrigger>
                <TabsTrigger value="CODE">Python</TabsTrigger>
              </TabsList>
            </div>
            <ScrollArea className="flex-grow">
              <div className="flex flex-col space-y-2 p-4 pl-0 pt-0">
                <TabsContent value="LLM">
                  <div className="flex flex-col space-y-2">
                    <Label>Prompt</Label>
                    <CodeEditor
                      className="border rounded"
                      value={prompt}
                      language="plaintext"
                      editable={true}
                      onChange={(value) => {
                        setPrompt(value);
                        updateLLMRunnableGraph(value);
                      }}
                    />
                  </div>
                </TabsContent>
                <TabsContent value="CODE">
                  <CodeEditor
                    className="border rounded"
                    value={code}
                    language="python"
                    editable={true}
                    onChange={(value) => {
                      setCode(value);
                      updateCodeRunnableGraph(value);
                    }}
                  />
                </TabsContent>
                <div className="text-secondary-foreground flex flex-col space-y-2">
                  <Label>Expected range of values</Label>
                  <div className="flex space-x-1">
                    {
                      labelClass.valueMap.map((value, index) => (
                        <div key={index} className="border rounded-md p-0.5 px-2 text-sm">
                          {value}
                        </div>
                      ))
                    }
                  </div>
                </div>
                <div className="flex flex-col flex-none h-[200px] space-y-2">
                  <div className="">
                    <Button
                      variant="outline"
                      onClick={runEval}
                      disabled={isRunning}
                    >
                      {isRunning ? (
                        <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                      ) : (
                        <Play className="w-3 h-3 mr-2" />
                      )}
                      {isRunning ? 'Running...' : 'Run'}
                    </Button>
                  </div>
                  <Label>Output</Label>
                  <Formatter
                    defaultMode="json"
                    value={output}
                    editable={false}
                  />
                </div>
              </div>
            </ScrollArea>
          </Tabs>
        </div>
      </div>

      <div className="flex-none border-t flex justify-end items-center p-4">
        <DialogClose asChild>
          <Button
            onClick={() => {
              if (runnableGraph.current) {
                onEvaluatorAdded?.(runnableGraph.current);
              }
            }}
          >
            Save online evaluator
          </Button>
        </DialogClose>
      </div>
    </div >
  );
}
