import {
  GenericNode,
  LLMNode,
  NodeType,
  RouterNode,
  SemanticSwitchNode,
  SemanticSearchNode,
  StringTemplateNode,
  WebSearchNode,
  JsonExtractorNode,
  FunctionNode,
} from "@/lib/flow/types";
import useStore from "@/lib/flow/store";
import LLM from "./nodes/llm";
import SemanticSearchNodeComponent from "./nodes/semantic-search-node";
import { ScrollArea } from "../ui/scroll-area";
import SwitchNodeComponent from "./nodes/switch-node";
import StringTemplateNodeComponent from "./nodes/string-template-node";
import SemanticSwitchNodeComponent from "./nodes/semantic-switch-node";
import JsonExtractorNodeComponent from "./nodes/json-extractor-node";
import WebSearchNodeComponent from "./nodes/web-search-node";
import FunctionNodeComponent from "./nodes/function-node";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

interface PipelineSheetProps {
  editable: boolean
}

export default function PipelineSheet({ editable }: PipelineSheetProps) {
  const { focusedNodeId, getNode, updateNodeData } = useStore(store => store)

  const data = getNode(focusedNodeId ?? "")?.data

  const renderNode = (data: GenericNode) => {
    switch (data.type) {
      case NodeType.LLM:
        return (
          <LLM data={data as LLMNode} editable={editable} />
        )
      case NodeType.SEMANTIC_SEARCH:
        return (
          <SemanticSearchNodeComponent data={data as SemanticSearchNode} />
        )
      case NodeType.SWITCH:
        return (
          <SwitchNodeComponent data={data as RouterNode} />
        )
      case NodeType.STRING_TEMPLATE:
        return (
          <StringTemplateNodeComponent data={data as StringTemplateNode} />
        )
      case NodeType.SEMANTIC_SWITCH:
        return (
          <SemanticSwitchNodeComponent data={data as SemanticSwitchNode} />
        )
      case NodeType.JSON_EXTRACTOR:
        return (
          <JsonExtractorNodeComponent data={data as JsonExtractorNode} />
        )
      case NodeType.WEB_SEARCH:
        return (
          <WebSearchNodeComponent data={data as WebSearchNode} />
        )
      case NodeType.FUNCTION:
        return (
          <FunctionNodeComponent data={data as FunctionNode} />
        )
      default:
        return null
    }
  }

  return (
    <div className="w-full h-full relative">
      {data &&
        <ScrollArea className="h-full w-full">
          <div className="max-h-0">
            <div className="flex flex-col p-4 space-y-2 bg-background pb-0">
              <Label>Node name</Label>
              <Input
                disabled={!editable}
                placeholder="Name of the node"
                value={data.name}
                onChange={(e) => {
                  updateNodeData(data.id, {
                    ...data,
                    name: e.currentTarget.value
                  })
                }}
                className="w-full"
              />
            </div>
            {!editable && data?.type !== NodeType.LLM && (
              <div className="absolute inset-0 z-50" />
            )}

            {renderNode(data)}
          </div>
        </ScrollArea>
      }
    </div>
  )

}