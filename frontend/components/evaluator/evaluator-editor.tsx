import { Loader2, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { v4 } from "uuid";

import { useProjectContext } from "@/contexts/project-context";
import { EventType } from "@/lib/events/types";
import { Graph } from "@/lib/flow/graph";
import { CodeNode, LLMNode, NodeHandleType, NodeType, OutputNode } from "@/lib/flow/types";
import { createNodeData, renderNodeInput } from "@/lib/flow/utils";
import { toast } from "@/lib/hooks/use-toast";
import { LanguageModel } from "@/lib/pipeline/types";
import { LabelClass, Span } from "@/lib/traces/types";

import LanguageModelSelect from "../pipeline/nodes/components/model-select";
import { Button } from "../ui/button";
import CodeEditor from "../ui/code-editor";
import { DialogClose } from "../ui/dialog";
import Formatter from "../ui/formatter";
import { Label } from "../ui/label";
import { ScrollArea } from "../ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

interface AutoEvalsProps {
  span: Span;
  labelClass: LabelClass;
  onEvaluatorAdded?: (evaluatorRunnableGraph: Graph) => void;
}

export function EvaluatorEditor({ span, labelClass, onEvaluatorAdded }: AutoEvalsProps) {
  const { projectId } = useProjectContext();
  const [evalType, setEvalType] = useState<"LLM" | "CODE">("LLM");
  const [inputs, setInputs] = useState<string>("");
  const [output, setOutput] = useState<string>("");
  const runnableGraph = useRef<Graph | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [wasTypeCast, setWasTypeCast] = useState(false);

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
        setEvalType("CODE");
      }
      const llmNode = Array.from(graph.nodes.values()).find((node) => node.type === NodeType.LLM) as LLMNode;
      if (llmNode) {
        setEvalType("LLM");
      }
    }
  }, [labelClass.evaluatorRunnableGraph]);

  const runGraph = async () => {
    const response = await fetch(`/api/projects/${projectId}/pipelines/run/graph`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        runId: v4(),
        graph: runnableGraph.current?.toObject(),
        inputs: JSON.parse(inputs),
        env: {},
        breakpointTaskIds: [],
        pipelineVersionId: v4(),
        devSessionIds: [],
        stream: false,
      }),
    });

    if (!response.ok) {
      setIsRunning(false);

      const err = await response.text();
      setOutput("");

      toast({
        title: "Error",
        description: err,
        variant: "destructive",
      });

      return;
    }

    const res = await response.json();

    let value = res["outputs"]["output"]["value"];

    if (typeof value !== "string") {
      setWasTypeCast(true);
      value = JSON.stringify(value);
    } else {
      setWasTypeCast(false);
    }

    setOutput(value);
  };

  const runEval = async () => {
    setIsRunning(true);
    try {
      await runGraph();
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex h-full space-x-4 w-full flex-grow">
        <div className="flex-1 items-center flex p-4 pr-0">
          <div className="flex flex-col h-full w-full flex-grow">
            <div className="pb-2 font-medium text-lg flex-none">Input</div>
            <div className="flex-grow relative">
              <div className="absolute inset-0 overflow-auto">
                <Formatter defaultMode="json" value={inputs} editable={true} onChange={(value) => setInputs(value)} />
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 flex flex-col space-y-2">
          <Tabs
            className="flex flex-col flex-grow"
            value={evalType}
            onValueChange={(value) => setEvalType(value as "LLM" | "CODE")}
          >
            <div className="flex-none pt-4 pr-4">
              <TabsList className="mb-4 flex-none m-0">
                <TabsTrigger value="LLM">LLM as a judge</TabsTrigger>
                <TabsTrigger value="CODE">Python</TabsTrigger>
              </TabsList>
            </div>
            <ScrollArea className="flex-grow">
              <div className="max-h-0">
                <div className="flex flex-col space-y-2 p-4 pl-0">
                  <TabsContent value="LLM">
                    <LLMEvaluator
                      graph={runnableGraph.current}
                      onGraphChanged={(graph) => {
                        runnableGraph.current = graph;
                      }}
                      labelClass={labelClass}
                    />
                  </TabsContent>
                  <TabsContent value="CODE">
                    <CodeEvaluator
                      graph={runnableGraph.current}
                      onGraphChanged={(graph) => {
                        runnableGraph.current = graph;
                      }}
                    />
                  </TabsContent>
                  <div className="flex flex-col space-y-2">
                    <Label className="text-secondary-foreground">Expected output</Label>
                    {/*<div className="flex space-x-1">*/}
                    {/*  {Object.keys(labelClass.valueMap).map((value, index) => (*/}
                    {/*    <div key={index} className="border rounded-md p-0.5 px-2 text-sm">*/}
                    {/*      {value}*/}
                    {/*    </div>*/}
                    {/*  ))}*/}
                    {/*</div>*/}
                  </div>
                  <div className="flex flex-col flex-none space-y-2">
                    <div className="">
                      <Button variant="outline" onClick={runEval} disabled={isRunning}>
                        {isRunning ? (
                          <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                        ) : (
                          <Play className="w-3 h-3 mr-2" />
                        )}
                        Run test
                      </Button>
                    </div>
                    {wasTypeCast && <div className="text-yellow-500 text-sm">Output was cast to string</div>}
                    <Label>Output</Label>
                    <Formatter className="max-h-[200px]" defaultMode="json" value={output} />
                  </div>
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
    </div>
  );
}

interface LLMEvaluatorProps {
  graph: Graph | null;
  onGraphChanged: (graph: Graph) => void;
  labelClass: LabelClass;
}

export default function LLMEvaluator({ graph, onGraphChanged, labelClass }: LLMEvaluatorProps) {
  const [prompt, setPrompt] =
    useState<string>(`You are an evaluator tasked with checking whether the output of a language model follows the given instruction. Your job is to assess if the model's response accurately addresses the task it was given.


Review the input provided to the model and its corresponding output. Then, determine if the output follows the instruction and provides an appropriate response.


Provide your reasoning for the assessment, explaining why you believe the output does or does not follow the instruction. Then, give a final verdict of either 'true' if the instruction was followed, or 'false' if it was not.


<llm_input>{{span_input}}</llm_input>


<llm_output>{{span_output}}</llm_output>`);
  const [model, setModel] = useState<LanguageModel>({
    id: "openai:gpt-4o-mini",
    name: "openai:gpt-4o-mini",
  });

  const [structuredOutputSchema, setStructuredOutputSchema] = useState<string>(`class Output {
  reasoning string @description("Explanation of why the output does or does not follow the instruction")
  value string @description("one of the following values: -")
}`);

  useEffect(() => {
    if (graph) {
      const llmNode = Array.from(graph.nodes.values()).find((node) => node.type === NodeType.LLM) as LLMNode;
      if (llmNode) {
        setPrompt(llmNode.prompt);
        setModel({
          id: llmNode.model as LanguageModel["id"],
          name: llmNode.model!,
        });
        setStructuredOutputSchema(llmNode.structuredOutputSchema!);
      }
    }
  }, [graph]);

  const updateGraph = (prompt: string, modelId: string, structuredOutputSchema: string) => {
    const node = createNodeData(v4(), NodeType.LLM) as LLMNode;
    node.prompt = prompt;
    node.model = modelId;
    node.structuredOutputEnabled = true;
    node.structuredOutputSchema = structuredOutputSchema;
    node.structuredOutputSchemaTarget = "Output";
    node.dynamicInputs = [
      {
        id: v4(),
        name: "span_input",
        type: NodeHandleType.STRING,
      },
      {
        id: v4(),
        name: "span_output",
        type: NodeHandleType.STRING,
      },
    ];

    const graph = Graph.fromNode(node);
    onGraphChanged(graph);
  };

  useEffect(() => {
    updateGraph(prompt, model.id, structuredOutputSchema);
  }, [prompt, model, structuredOutputSchema]);

  return (
    <div className="flex flex-col space-y-2">
      <LanguageModelSelect modelId={model.id} onModelChange={(value) => setModel(value)} />
      <Label>Prompt</Label>
      <CodeEditor
        placeholder="You are a smart evaluator..."
        className="border rounded"
        value={prompt}
        language="plaintext"
        editable={true}
        onChange={(value) => setPrompt(value)}
      />
      <Label>Output schema</Label>
      <CodeEditor
        className="border rounded"
        value={structuredOutputSchema}
        language="json"
        editable={true}
        onChange={(value) => setStructuredOutputSchema(value)}
      />
    </div>
  );
}

interface CodeEvaluatorProps {
  graph: Graph | null;
  onGraphChanged: (graph: Graph) => void;
}

function CodeEvaluator({ graph, onGraphChanged }: CodeEvaluatorProps) {
  const [code, setCode] = useState<string>(
    '# has to return a string matching one of the expected values\ndef main(span_input, span_output):\n    return "correct"'
  );

  useEffect(() => {
    if (graph) {
      const codeNode = Array.from(graph.nodes.values()).find((node) => node.type === NodeType.CODE) as CodeNode;

      if (codeNode) {
        setCode(codeNode.code!);
      }
    }
  }, [graph]);

  const updateGraph = (code: string) => {
    const node = createNodeData(v4(), NodeType.CODE) as CodeNode;
    node.code = code;
    node.fnName = "main";
    node.inputs = [
      {
        id: v4(),
        name: "span_input",
        type: NodeHandleType.STRING,
      },
      {
        id: v4(),
        name: "span_output",
        type: NodeHandleType.STRING,
      },
    ];
    node.outputs = [
      {
        id: v4(),
        type: NodeHandleType.ANY,
      },
    ];

    const graph = Graph.fromNode(node);
    const outputNode = Array.from(graph.nodes.values()).find((node) => node.type === NodeType.OUTPUT) as OutputNode;
    outputNode.outputCastType = EventType.STRING;

    onGraphChanged(graph);
  };

  useEffect(() => {
    updateGraph(code);
  }, [code]);

  return (
    <div className="flex flex-col space-y-2">
      <Label>Python Code</Label>
      <CodeEditor
        className="border rounded"
        value={code}
        language="python"
        editable={true}
        onChange={(value) => setCode(value)}
      />
    </div>
  );
}
