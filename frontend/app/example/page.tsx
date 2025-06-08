import LangGraphViewer from "@/components/langgraph/index";
import { LangGraphStructure } from "@/lib/langgraph/graph";

const mockLangGraphData: LangGraphStructure = {
  nodes: [
    {
      id: "__start__",
      type: "schema",
      data: "__start__",
    },
    {
      id: "agent",
      type: "runnable",
      data: {
        id: ["langchain", "schema", "runnable", "RunnableAssign"],
        name: "agent",
      },
    },
    {
      id: "tools",
      type: "runnable",
      data: {
        id: ["langgraph", "utils", "runnable", "RunnableCallable"],
        name: "tools",
      },
      metadata: {
        parents: {},
        version: 2,
        variant: "b",
      },
    },
    {
      id: "__end__",
      type: "schema",
      data: "__end__",
    },
  ],
  edges: [
    {
      source: "__start__",
      target: "agent",
    },
    {
      source: "tools",
      target: "agent",
    },
    {
      source: "agent",
      target: "tools",
      data: "continue",
      conditional: true,
    },
    {
      source: "agent",
      target: "__end__",
      data: "exit",
      conditional: true,
    },
  ],
};

export default function GraphExamplePage() {
  return (
    <div className="w-full h-screen">
      <h1 className="text-2xl font-bold p-4">LangGraph Visualization</h1>
      <div className="w-full h-5/6">
        <LangGraphViewer graphData={mockLangGraphData} />
      </div>
    </div>
  );
}
